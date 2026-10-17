mod login;
mod token;
mod two_factor_auth;

use aes::cipher::BlockModeDecrypt;
use cbc::cipher::{KeyIvInit, block_padding::Pkcs7};
use hmac::{Hmac, KeyInit, Mac};
use reqwest::Response;
use sha2::Sha256;
use srp::ClientVerifier;

use crate::Error;

pub async fn parse_response(
    res: Result<Response, reqwest::Error>,
) -> Result<plist::Dictionary, Error> {
    let res = res?;
    let status = res.status();
    let url = res.url().to_string();
    let server = res.headers().get("server").and_then(|v| v.to_str().ok()).unwrap_or("-").to_string();
    let ctype = res.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("-").to_string();
    let text = res.text().await?;
    let snippet = |t: &str| -> String {
        let flat: String = t.split_whitespace().collect::<Vec<_>>().join(" ");
        flat.chars().take(400).collect()
    };
    if !status.is_success() {
        return Err(Error::Diagnostic(format!(
            "HTTP {} from {} [server: {}, type: {}] body: {}",
            status.as_u16(), url, server, ctype, snippet(&text)
        )));
    }
    let res: plist::Dictionary = match plist::from_bytes(text.as_bytes()) {
        Ok(d) => d,
        Err(e) => {
            return Err(Error::Diagnostic(format!(
                "Not a plist ({}) - HTTP {} from {} [server: {}, type: {}] body: {}",
                e, status.as_u16(), url, server, ctype, snippet(&text)
            )))
        }
    };
    let res: plist::Value = res.get("Response").unwrap().to_owned();
    match res {
        plist::Value::Dictionary(dict) => Ok(dict),
        _ => Err(crate::Error::Parse),
    }
}

pub fn check_error(res: &plist::Dictionary) -> Result<(), Error> {
    let res = match res.get("Status") {
        Some(plist::Value::Dictionary(d)) => d,
        _ => &res,
    };

    if res.get("ec").unwrap().as_signed_integer().unwrap() != 0 {
        return Err(Error::AuthSrpWithMessage(
            res.get("ec").unwrap().as_signed_integer().unwrap().into(),
            res.get("em").unwrap().as_string().unwrap().to_owned(),
        ));
    }

    Ok(())
}

pub fn decrypt_cbc(usr: &ClientVerifier<Sha256>, data: &[u8]) -> Vec<u8> {
    let extra_data_key = create_session_key(usr, "extra data key:");
    let extra_data_iv = create_session_key(usr, "extra data iv:");
    let extra_data_iv = &extra_data_iv[..16];

    cbc::Decryptor::<aes::Aes256>::new_from_slices(&extra_data_key, extra_data_iv)
        .unwrap()
        .decrypt_padded_vec::<Pkcs7>(&data)
        .unwrap()
}

pub fn create_session_key(usr: &ClientVerifier<Sha256>, name: &str) -> Vec<u8> {
    Hmac::<Sha256>::new_from_slice(&usr.key())
        .unwrap()
        .chain_update(name.as_bytes())
        .finalize()
        .into_bytes()
        .to_vec()
}
