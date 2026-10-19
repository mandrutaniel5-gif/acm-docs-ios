package ro.acmcode.docs;

import android.annotation.TargetApi;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.security.keystore.UserNotAuthenticatedException;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Account keys and the 24 recovery words on Android: encrypted with an AES key that lives in the
 * phone's Keystore (hardware when available) and only works for 30 seconds after the owner
 * unlocked with PIN / pattern / fingerprint. The key never leaves the phone, so a copy of the
 * encrypted files (backup, another phone) is useless.
 */
@TargetApi(23)
final class SecureStore {
    static final String ALIAS = "acm-docs-secure-v1";
    static final int VALID_SECONDS = 30;

    /** the phone has no screen lock: keys cannot be protected */
    static final class NoLock extends Exception { NoLock() { super("nolock"); } }
    /** the owner has to confirm with PIN / fingerprint first */
    static final class NeedAuth extends Exception { NeedAuth() { super("auth"); } }

    private final Context ctx;
    private final File dir;

    SecureStore(Context ctx) {
        this.ctx = ctx;
        this.dir = new File(ctx.getNoBackupFilesDir(), "secure");
        dir.mkdirs();
    }

    static boolean supported() { return Build.VERSION.SDK_INT >= 23; }

    boolean deviceSecure() {
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    private File fileOf(String name) {
        return new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_") + ".bin");
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        if (!deviceSecure()) throw new NoLock();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationValidityDurationSeconds(VALID_SECONDS)
                .build());
        return kg.generateKey();
    }

    void set(String name, byte[] data) throws Exception {
        if (!deviceSecure()) throw new NoLock();
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        try {
            c.init(Cipher.ENCRYPT_MODE, key());
        } catch (UserNotAuthenticatedException e) {
            throw new NeedAuth();
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException e) {
            reset();
            throw new NeedAuth();
        }
        byte[] ct = c.doFinal(data);
        byte[] iv = c.getIV();
        File tmp = new File(dir, fileOf(name).getName() + ".tmp");
        FileOutputStream o = new FileOutputStream(tmp);
        try { o.write(iv.length); o.write(iv); o.write(ct); } finally { o.close(); }
        if (!tmp.renameTo(fileOf(name))) throw new IOException("write");
    }

    /** null = nothing saved under this name */
    byte[] get(String name) throws Exception {
        File f = fileOf(name);
        if (!f.isFile()) return null;
        byte[] all = new byte[(int) f.length()];
        FileInputStream in = new FileInputStream(f);
        try { int n = 0; while (n < all.length) { int r = in.read(all, n, all.length - n); if (r < 0) break; n += r; } } finally { in.close(); }
        int ivLen = all[0] & 0xff;
        byte[] iv = Arrays.copyOfRange(all, 1, 1 + ivLen);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        try {
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        } catch (UserNotAuthenticatedException e) {
            throw new NeedAuth();
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException e) {
            // the screen lock was removed: the old key is gone for good, so are the saved items
            reset();
            return null;
        }
        return c.doFinal(all, 1 + ivLen, all.length - 1 - ivLen);
    }

    boolean has(String name) { return fileOf(name).isFile(); }

    void delete(String name) { fileOf(name).delete(); }

    private void reset() {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            ks.deleteEntry(ALIAS);
        } catch (Exception e) { /* nothing to remove */ }
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) f.delete();
    }
}
