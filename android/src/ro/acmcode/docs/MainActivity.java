package ro.acmcode.docs;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PdfPrinter;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * ACM Docs (by ACM Code SRL) for Android: the same app as on Windows, shown in a
 * WebView. This class gives the page access to files, the camera, sharing and
 * PDF printing through window.AndroidBridge.
 */
public class MainActivity extends Activity {
    static final String TAG = "ACMDocs";
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST + "/";

    static final int REQ_OPEN = 11, REQ_CAMERA = 12, REQ_EXPORT = 13, REQ_CHOOSER = 14, REQ_PERM = 15, REQ_IMAGES = 16, REQ_AUTH = 17, REQ_CAM_PERM = 18;
    SecureStore secure, secureQuiet;
    int authId = 0;
    Runnable authRetry = null;

    WebView web;
    android.widget.FrameLayout root;
    File docsRoot;
    final Handler ui = new Handler(Looper.getMainLooper());
    String startupPath = null;
    boolean pageLoaded = false;
    volatile String lang = "ro";

    String t(String ro, String en) { return "en".equals(lang) ? en : ro; }

    // a request waiting for another app (file picker, camera, "save as")
    int pendingId = 0;
    int pendingReq = 0;
    File pendingFile = null;
    ValueCallback<Uri[]> chooserCb = null;

    // ------------------------------------------------------------------ start

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(isNight() ? Color.BLACK : Color.parseColor("#F2F2F7"));
        // The page on top; behind it, room for the hidden pages that become PDFs.
        root = new android.widget.FrameLayout(this);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        setBars(isNight(), isNight() ? "#000000" : "#F2F2F7");

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setMediaPlaybackRequiresUserGesture(false); // the live QR scanner shows the camera at once
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        takeIntent(getIntent());

        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT <= 28
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE }, REQ_PERM);
        } else {
            start();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_PERM) start();
        if (requestCode == REQ_CAM_PERM) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Runnable r = ok ? afterCamera : cameraDenied;
            afterCamera = null; cameraDenied = null;
            if (r != null) r.run();
        }
    }

    // ------------------------------------------------------------------ camera permission
    Runnable afterCamera, cameraDenied;
    boolean hasCamera() { return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED; }
    /** Runs `then` once the camera may be used (asks the person the first time). */
    void withCamera(Runnable then, Runnable denied) {
        if (hasCamera()) { then.run(); return; }
        if (cameraDenied != null) cameraDenied.run();
        afterCamera = then; cameraDenied = denied;
        requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAM_PERM);
    }

    void start() {
        docsRoot = pickDocsRoot();
        web.loadUrl(ORIGIN + "index.html");
    }

    boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Documents/ACM Docs when the phone allows it, otherwise the app's own folder. */
    File pickDocsRoot() {
        File pub = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "ACM Docs");
        boolean publicOk = Build.VERSION.SDK_INT >= 30 || Build.VERSION.SDK_INT < 29;
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) publicOk = false;
        if (publicOk && canWrite(pub)) return pub;
        File ext = getExternalFilesDir(null);
        if (ext != null) {
            File own = new File(ext, "ACM Docs");
            if (canWrite(own)) return own;
        }
        File in = new File(getFilesDir(), "ACM Docs");
        in.mkdirs();
        return in;
    }

    static boolean canWrite(File dir) {
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return false;
            File t = new File(dir, ".acm-test");
            FileOutputStream o = new FileOutputStream(t);
            o.write(1);
            o.close();
            t.delete();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String p = takeIntent(intent);
        if (p != null && pageLoaded) {
            startupPath = null;
            js("window.__onOpenFile && window.__onOpenFile(" + JSONObject.quote(p) + ")");
        }
    }

    /** A file sent to the app (Open with…, Share…): copied into the app's folder. */
    String takeIntent(Intent intent) {
        if (intent == null) return null;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return null;
        try {
            if (docsRoot == null) docsRoot = pickDocsRoot();
            startupPath = importUri(uri).getAbsolutePath();
            return startupPath;
        } catch (Exception e) {
            Log.e(TAG, "intent", e);
            Toast.makeText(this, "Nu am putut deschide fișierul.", Toast.LENGTH_LONG).show();
            return null;
        }
    }

    @Override
    public void onBackPressed() {
        if (!pageLoaded) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.__onBack ? window.__onBack() : false)", new ValueCallback<String>() {
            @Override public void onReceiveValue(String v) {
                if (!"true".equals(v)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ helpers

    void js(final String code) {
        ui.post(new Runnable() {
            @Override public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    void reply(int id, String error, String result) {
        js("window.__bridgeCb && window.__bridgeCb(" + id + "," + (error == null ? "null" : JSONObject.quote(error)) + ","
                + (result == null ? "null" : JSONObject.quote(result)) + ")");
    }

    void setBars(boolean dark, String color) {
        Window w = getWindow();
        int c;
        try { c = Color.parseColor(color == null || color.isEmpty() ? (dark ? "#000000" : "#F2F2F7") : color); } catch (Exception e) { c = dark ? Color.BLACK : Color.WHITE; }
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        int flags = w.getDecorView().getSystemUiVisibility();
        int lightStatus = 0x00002000; // SYSTEM_UI_FLAG_LIGHT_STATUS_BAR (API 23)
        int lightNav = 0x00000010; // SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR (API 26)
        if (Build.VERSION.SDK_INT >= 23) flags = dark ? flags & ~lightStatus : flags | lightStatus;
        if (Build.VERSION.SDK_INT >= 26) flags = dark ? flags & ~lightNav : flags | lightNav;
        w.getDecorView().setSystemUiVisibility(flags);
        web.setBackgroundColor(c);
    }

    static String mimeOf(String name) {
        String ext = name.lastIndexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        switch (ext) {
            case "html": return "text/html";
            case "js": return "application/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "wasm": return "application/wasm";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "gz": return "application/gzip";
            case "pdf": return "application/pdf";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "doc": return "application/msword";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "xls": return "application/vnd.ms-excel";
            case "csv": return "text/csv";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "txt": return "text/plain";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return m != null ? m : "application/octet-stream";
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        out.close();
    }

    String displayName(Uri uri) {
        String name = null;
        if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            Cursor c = null;
            try {
                c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception e) {
                // no name: use the end of the address
            } finally {
                if (c != null) c.close();
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "document";
        name = name.replaceAll("[\\\\/:*?\"<>|]+", " ").trim();
        if (name.indexOf('.') < 0) {
            String m = getContentResolver().getType(uri);
            String ext = m != null ? MimeTypeMap.getSingleton().getExtensionFromMimeType(m) : null;
            if (ext != null) name += "." + ext;
        }
        return name;
    }

    /** Copies a picked/shared file into "ACM Docs/Importate" (same name; same file is reused). */
    File importUri(Uri uri) throws IOException {
        if ("file".equals(uri.getScheme()) && uri.getPath() != null) {
            File f = checked(new File(uri.getPath())); // another app cannot make us open our own internals
            if (f.isFile() && f.canRead()) return f;
        }
        File dir = new File(docsRoot, "Importate");
        dir.mkdirs();
        String name = displayName(uri);
        byte[] data = readAll(getContentResolver().openInputStream(uri));
        String base = name, ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) { base = name.substring(0, dot); ext = name.substring(dot); }
        File target = new File(dir, name);
        for (int i = 2; target.exists(); i++) {
            if (target.length() == data.length && Arrays.equals(readAll(new FileInputStream(target)), data)) return target;
            target = new File(dir, base + " (" + i + ")" + ext);
        }
        FileOutputStream o = new FileOutputStream(target);
        o.write(data);
        o.close();
        scan(target);
        return target;
    }

    void scan(File f) {
        try {
            MediaScannerConnection.scanFile(this, new String[] { f.getAbsolutePath() }, null, null);
        } catch (Exception e) {
            // not important
        }
    }

    Uri uriFor(File f) {
        return Files.uriFor(f);
    }

    // ------------------------------------------------------------------ other apps

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CHOOSER) {
            if (chooserCb != null) {
                Uri[] r = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) r = new Uri[] { data.getData() };
                chooserCb.onReceiveValue(r);
                chooserCb = null;
            }
            return;
        }
        if (requestCode == REQ_AUTH) {
            final int id = authId;
            final Runnable retry = authRetry;
            authId = 0;
            authRetry = null;
            if (resultCode == RESULT_OK && retry != null) new Thread(retry).start();
            else if (id != 0) reply(id, "cancel", null);
            return;
        }
        if (requestCode != pendingReq) return;
        final int id = pendingId;
        final File file = pendingFile;
        pendingReq = 0;
        pendingId = 0;
        pendingFile = null;
        if (requestCode == REQ_OPEN) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) { reply(id, null, null); return; }
            final Uri uri = data.getData();
            new Thread(new Runnable() {
                @Override public void run() {
                    try { reply(id, null, importUri(uri).getAbsolutePath()); } catch (Exception e) { reply(id, "Nu am putut citi fișierul ales: " + e.getMessage(), null); }
                }
            }).start();
        } else if (requestCode == REQ_IMAGES) {
            if (resultCode != RESULT_OK || data == null) { reply(id, null, null); return; }
            final java.util.List<Uri> uris = new java.util.ArrayList<Uri>();
            if (data.getClipData() != null) for (int k = 0; k < data.getClipData().getItemCount(); k++) uris.add(data.getClipData().getItemAt(k).getUri());
            else if (data.getData() != null) uris.add(data.getData());
            new Thread(new Runnable() {
                @Override public void run() {
                    try {
                        File dir = new File(getCacheDir(), "scan");
                        dir.mkdirs();
                        JSONArray out = new JSONArray();
                        int n = 0;
                        for (Uri u : uris) {
                            File f = new File(dir, System.currentTimeMillis() + "-" + (n++) + ".jpg");
                            copy(getContentResolver().openInputStream(u), new FileOutputStream(f));
                            out.put(f.getAbsolutePath());
                        }
                        reply(id, null, out.toString());
                    } catch (Exception e) { reply(id, "Nu am putut citi pozele alese: " + e.getMessage(), null); }
                }
            }).start();
        } else if (requestCode == REQ_CAMERA) {
            if (resultCode == RESULT_OK && file != null && file.length() > 0) { scan(file); reply(id, null, file.getAbsolutePath()); }
            else { if (file != null) file.delete(); reply(id, null, null); }
        } else if (requestCode == REQ_EXPORT) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null || file == null) { reply(id, null, null); return; }
            try {
                copy(new FileInputStream(file), getContentResolver().openOutputStream(data.getData()));
                reply(id, null, "true");
            } catch (Exception e) {
                reply(id, "Nu am putut salva copia: " + e.getMessage(), null);
            }
        }
    }

    // ------------------------------------------------------------------ account keys (Keystore + screen lock)

    void secureOp(final int id, final String op, final JSONObject a, final boolean retried) {
        if (!SecureStore.supported()) { reply(id, t("Conturile ACM Docs au nevoie de Android 6 sau mai nou.", "ACM Docs accounts need Android 6 or newer."), null); return; }
        if (secure == null) secure = new SecureStore(this);
        if (secureQuiet == null) secureQuiet = new SecureStore(this, true);
        final SecureStore store = a.optBoolean("quiet", false) ? secureQuiet : secure;
        final String name = a.optString("name", "");
        if ("secureHas".equals(op)) { reply(id, null, store.has(name) ? "true" : "false"); return; }
        if ("secureDelete".equals(op)) { store.delete(name); reply(id, null, "true"); return; }
        if ("confirmOwner".equals(op)) {
            if (!secure.deviceSecure()) { reply(id, "nolock", null); return; }
            askOwner(id, a.optString("reason", ""), new Runnable() { @Override public void run() { reply(id, null, "true"); } });
            return;
        }
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    if ("secureSet".equals(op)) {
                        store.set(name, Base64.decode(a.optString("data", ""), Base64.NO_WRAP));
                        reply(id, null, "true");
                    } else {
                        byte[] b = store.get(name);
                        reply(id, null, b == null ? null : Base64.encodeToString(b, Base64.NO_WRAP));
                    }
                } catch (SecureStore.NoLock e) {
                    reply(id, t("Setează un PIN, un model sau amprenta pentru ecranul de blocare al telefonului: fără ele cheile contului nu pot fi protejate.", "Set a screen lock (PIN, pattern or fingerprint) on this phone: without it the account keys cannot be protected."), null);
                } catch (SecureStore.NeedAuth e) {
                    if (retried) { reply(id, "cancel", null); return; }
                    String reason = a.optString("reason", "");
                    askOwner(id, reason, new Runnable() { @Override public void run() { secureOp(id, op, a, true); } });
                } catch (Exception e) {
                    reply(id, "secure: " + e, null);
                }
            }
        }).start();
    }

    /** PIN / pattern / fingerprint of the phone, then `then` (or "cancel"). */
    void askOwner(final int id, final String reason, final Runnable then) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                Intent i = km == null ? null : km.createConfirmDeviceCredentialIntent("ACM Docs", reason.isEmpty() ? t("Confirmă că ești tu", "Confirm it's you") : reason);
                if (i == null) { new Thread(then).start(); return; } // no screen lock: nothing to confirm with
                if (authId != 0) reply(authId, "cancel", null);
                authId = id;
                authRetry = then;
                try { startActivityForResult(i, REQ_AUTH); } catch (ActivityNotFoundException e) { authId = 0; authRetry = null; reply(id, "cancel", null); }
            }
        });
    }

    void startFor(int id, int req, File file, Intent intent) {
        if (pendingId != 0) reply(pendingId, null, null);
        pendingId = id;
        pendingReq = req;
        pendingFile = file;
        try {
            startActivityForResult(intent, req);
        } catch (ActivityNotFoundException e) {
            pendingId = 0;
            pendingReq = 0;
            reply(id, req == REQ_CAMERA ? "Nu am găsit aplicația Cameră." : "Nu am găsit o aplicație pentru asta.", null);
        }
    }

    void handle(final int id, String op, JSONObject a) throws Exception {
        if ("startup".equals(op)) {
            String p = startupPath;
            startupPath = null;
            reply(id, null, p);
        } else if ("open".equals(op)) {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            JSONArray m = a.optJSONArray("mimes");
            if (m != null && m.length() > 0) {
                String[] mimes = new String[m.length()];
                for (int k = 0; k < m.length(); k++) mimes[k] = m.getString(k);
                if (mimes.length == 1) i.setType(mimes[0]);
                else i.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
            }
            startFor(id, REQ_OPEN, null, i);
        } else if ("images".equals(op)) {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startFor(id, REQ_IMAGES, null, Intent.createChooser(i, t("Alege pozele", "Choose photos")));
        } else if ("camera".equals(op)) {
            if (!hasCamera()) {
                final JSONObject args = a;
                withCamera(new Runnable() { @Override public void run() { try { handle(id, "camera", args); } catch (Exception e) { reply(id, e.getMessage(), null); } } },
                    new Runnable() { @Override public void run() { reply(id, t("Fără acces la cameră. Îl poți permite din Setările telefonului › Aplicații › ACM Docs.", "No camera access. You can allow it in the phone's Settings › Apps › ACM Docs."), null); } });
                return;
            }
            File dir = new File(docsRoot, "Scanări");
            dir.mkdirs();
            File f = new File(dir, "Scan " + new SimpleDateFormat("yyyy-MM-dd HH.mm.ss", Locale.ROOT).format(new Date()) + ".jpg");
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            Uri out = uriFor(f);
            i.putExtra(MediaStore.EXTRA_OUTPUT, out);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.setClipData(android.content.ClipData.newRawUri("", out));
            startFor(id, REQ_CAMERA, f, i);
        } else if ("export".equals(op)) {
            File f = checked(new File(a.getString("path")));
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mimeOf(f.getName()));
            i.putExtra(Intent.EXTRA_TITLE, f.getName());
            startFor(id, REQ_EXPORT, f, i);
        } else if ("share".equals(op)) {
            File f = checked(new File(a.getString("path")));
            if (!f.isFile()) throw new Exception("Fișierul nu mai există.");
            Intent i = new Intent(Intent.ACTION_SEND);
            Uri u = uriFor(f);
            i.setType(mimeOf(f.getName()));
            i.putExtra(Intent.EXTRA_STREAM, u);
            String text = a.optString("text", "");
            if (!text.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, text);
            i.setClipData(android.content.ClipData.newRawUri("", u));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, t("Trimite „", "Send “") + f.getName() + t("”", "”")));
            reply(id, null, "true");
        } else if ("fetch".equals(op)) {
            final String url = a.getString("url");
            if (!url.startsWith("https://www.bnr.ro/") && !url.startsWith("https://bnr.ro/")) throw new Exception("blocked");
            new Thread(new Runnable() {
                @Override public void run() {
                    try {
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setConnectTimeout(10000);
                        c.setReadTimeout(10000);
                        byte[] b = readAll(c.getInputStream());
                        reply(id, null, new String(b, "UTF-8"));
                    } catch (Exception e) {
                        reply(id, t("Fără internet", "No internet") + ": " + e.getMessage(), null);
                    }
                }
            }).start();
        } else if ("external".equals(op)) {
            String url = a.getString("url");
            String low = url.toLowerCase(java.util.Locale.ROOT);
            if (!low.startsWith("https://") && !low.startsWith("http://") && !low.startsWith("mailto:")) { reply(id, "blocked", null); return; }
            Intent i = url.startsWith("mailto:") ? new Intent(Intent.ACTION_SENDTO, Uri.parse(url)) : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            try {
                startActivity(i);
                reply(id, null, "true");
            } catch (ActivityNotFoundException e) {
                reply(id, t("Nu am găsit o aplicație care să deschidă asta.", "No app on this phone can open this."), null);
            }
        } else if ("view".equals(op)) {
            File f = checked(new File(a.getString("path")));
            Intent i = new Intent(Intent.ACTION_VIEW);
            Uri u = uriFor(f);
            i.setDataAndType(u, mimeOf(f.getName()));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(Intent.createChooser(i, t("Deschide cu", "Open with")));
                reply(id, null, "true");
            } catch (ActivityNotFoundException e) {
                reply(id, "Nicio aplicație de pe telefon nu poate deschide acest fișier.", null);
            }
        } else if ("pdf".equals(op)) {
            final File out = File.createTempFile("print", ".pdf", getCacheDir());
            PdfPrinter.print(this, root, a.getString("html"), ORIGIN,
                    a.optInt("width", 8268), a.optInt("height", 11693),
                    new int[] { a.optInt("left", 0), a.optInt("top", 0), a.optInt("right", 0), a.optInt("bottom", 0) },
                    out, new PdfPrinter.Done() {
                        @Override public void ok(final File f) {
                            new Thread(new Runnable() {
                                @Override public void run() {
                                    try {
                                        byte[] b = readAll(new FileInputStream(f));
                                        f.delete();
                                        reply(id, null, Base64.encodeToString(b, Base64.NO_WRAP));
                                    } catch (Exception e) {
                                        reply(id, "PDF: " + e.getMessage(), null);
                                    }
                                }
                            }).start();
                        }
                        @Override public void fail(String error) {
                            out.delete();
                            reply(id, error, null);
                        }
                    });
        } else if ("capture".equals(op)) {
            float d = getResources().getDisplayMetrics().density;
            int x = Math.round((float) a.optDouble("x", 0) * d), y = Math.round((float) a.optDouble("y", 0) * d);
            int w = Math.round((float) a.optDouble("w", 100) * d), h = Math.round((float) a.optDouble("h", 100) * d);
            x = Math.max(0, x);
            y = Math.max(0, y);
            w = Math.max(1, Math.min(w, web.getWidth() - x));
            h = Math.max(1, Math.min(h, web.getHeight() - y));
            float k = Math.min(1f, 220f / w);
            Bitmap bmp = Bitmap.createBitmap(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), Bitmap.Config.RGB_565);
            Canvas c = new Canvas(bmp);
            c.scale(k, k);
            c.translate(-x, -y);
            web.draw(c);
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 75, o);
            bmp.recycle();
            reply(id, null, Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP));
        } else if ("privacy".equals(op)) {
            final boolean on = a.optBoolean("on", false);
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    // no screenshots, no screen recording, blank in the recent-apps list
                    if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                }
            });
            reply(id, null, "true");
        } else if ("integrity".equals(op)) {
            JSONArray signs = new JSONArray();
            String[] su = { "/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/system/app/Superuser.apk", "/data/adb/magisk", "/system/bin/magisk", "/data/local/xbin/su", "/data/local/bin/su" };
            for (String p : su) if (new File(p).exists()) signs.put(p);
            if (Build.TAGS != null && Build.TAGS.contains("test-keys")) signs.put("test-keys");
            JSONObject o = new JSONObject();
            o.put("risk", signs.length() > 0);
            o.put("signs", signs);
            reply(id, null, o.toString());
        } else if ("secureSet".equals(op) || "secureGet".equals(op) || "secureHas".equals(op) || "secureDelete".equals(op) || "confirmOwner".equals(op)) {
            secureOp(id, op, a, false);
        } else {
            reply(id, "Operație necunoscută: " + op, null);
        }
    }

    // ------------------------------------------------------------------ the page's window.AndroidBridge

    /**
     * The app's own internals (settings, web storage, keys) are never handed to the page or to
     * other apps: inside the app's private folder only its document, private and cache folders count.
     */
    File checked(File f) throws IOException {
        String c = f.getCanonicalPath();
        String data = new File(getApplicationInfo().dataDir).getCanonicalPath();
        if (c.equals(data) || c.startsWith(data + File.separator)) {
            String[] ok = { new File(getFilesDir(), "ACM Docs").getCanonicalPath(), new File(getNoBackupFilesDir(), "private").getCanonicalPath(), getCacheDir().getCanonicalPath() };
            for (String o : ok) if (c.equals(o) || c.startsWith(o + File.separator)) return f;
            throw new IOException("blocked path");
        }
        return f;
    }

    class Bridge {
        File file(String p) throws IOException {
            if (p == null || p.isEmpty()) throw new IOException("cale goală");
            return checked(new File(p));
        }

        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("docs", docsRoot != null ? docsRoot.getAbsolutePath() : "");
                // app-private storage (other apps and file managers cannot see it): decrypted copies
                File priv = new File(getNoBackupFilesDir(), "private");
                priv.mkdirs();
                o.put("priv", priv.getAbsolutePath());
                o.put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("density", getResources().getDisplayMetrics().density);
            } catch (Exception e) {
                // keep what we have
            }
            return o.toString();
        }

        @JavascriptInterface
        public String readB64(String path) throws IOException {
            return Base64.encodeToString(readAll(new FileInputStream(file(path))), Base64.NO_WRAP);
        }

        @JavascriptInterface
        public String readAsset(String path) throws IOException {
            return Base64.encodeToString(readAll(getAssets().open("www/" + path)), Base64.NO_WRAP);
        }

        @JavascriptInterface
        public boolean writeB64(String path, String b64) {
            try {
                File f = file(path);
                File dir = f.getParentFile();
                if (dir != null) dir.mkdirs();
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File tmp = new File(dir, "." + f.getName() + ".tmp");
                FileOutputStream o = new FileOutputStream(tmp);
                o.write(data);
                o.getFD().sync();
                o.close();
                if (!tmp.renameTo(f)) {
                    o = new FileOutputStream(f);
                    o.write(data);
                    o.close();
                    tmp.delete();
                }
                scan(f);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "write " + path, e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean isFile(String path) {
            try { return file(path).isFile(); } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String listDir(String path) {
            JSONArray a = new JSONArray();
            try {
                String[] names = file(path).list();
                if (names != null) for (String n : names) a.put(n);
            } catch (Exception e) {
                // empty
            }
            return a.toString();
        }

        @JavascriptInterface
        public boolean mkdirs(String path) {
            try { File f = file(path); return f.isDirectory() || f.mkdirs(); } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public double mtime(String path) {
            try { return file(path).lastModified(); } catch (Exception e) { return 0; }
        }

        @JavascriptInterface
        public boolean remove(String path) {
            try { return file(path).delete(); } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String fonts() {
            JSONArray a = new JSONArray();
            Map<String, Boolean> seen = new HashMap<String, Boolean>();
            try {
                String[] bundled = getAssets().list("www/fonts");
                if (bundled != null) for (String n : bundled) if (n.toLowerCase(Locale.ROOT).endsWith(".ttf")) addFont(a, seen, n, "asset:fonts/" + n);
            } catch (Exception e) {
                // none
            }
            File[] sys = new File("/system/fonts").listFiles();
            if (sys != null) for (File f : sys) {
                String n = f.getName();
                String l = n.toLowerCase(Locale.ROOT);
                if (l.endsWith(".ttf") || l.endsWith(".otf") || l.endsWith(".ttc")) addFont(a, seen, n, f.getAbsolutePath());
            }
            return a.toString();
        }

        void addFont(JSONArray a, Map<String, Boolean> seen, String file, String path) {
            String base = file.replaceAll("\\.(ttf|otf|ttc|TTF|OTF|TTC)$", "").replace('-', ' ').replace('_', ' ')
                    .replaceAll("([a-z])([A-Z])", "$1 $2").trim();
            if (seen.containsKey(base.toLowerCase(Locale.ROOT))) return;
            seen.put(base.toLowerCase(Locale.ROOT), true);
            try {
                JSONObject o = new JSONObject();
                o.put("name", base);
                o.put("path", path);
                a.put(o);
            } catch (JSONException e) {
                // skip
            }
        }

        @JavascriptInterface
        public void request(final int id, final String op, final String args) {
            ui.post(new Runnable() {
                @Override public void run() {
                    try {
                        handle(id, op, new JSONObject(args == null || args.isEmpty() ? "{}" : args));
                    } catch (Throwable e) {
                        Log.e(TAG, op, e);
                        reply(id, e.getMessage() != null ? e.getMessage() : e.toString(), null);
                    }
                }
            });
        }

        @JavascriptInterface
        public void setTheme(final boolean dark, final String color) {
            ui.post(new Runnable() {
                @Override public void run() { setBars(dark, color); }
            });
        }

        @JavascriptInterface
        public void setLang(String l) {
            lang = "ro".equals(l) ? "ro" : "en"; // every other language: English for the few native messages
        }

        @JavascriptInterface
        public void exit() {
            ui.post(new Runnable() {
                @Override public void run() { finish(); }
            });
        }
    }

    // ------------------------------------------------------------------ the app's own pages

    /** Major version of the system WebView (Chrome), 0 when unknown (old Android). */
    int webViewMajor() {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(WebSettings.getDefaultUserAgent(this));
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception e) { /* unknown */ }
        return 0;
    }

    class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            if (path.startsWith("/~file/")) {
                // a file of the phone, streamed to the app (much faster than copying it as text)
                try {
                    File f = checked(new File(Uri.decode(path.substring(6))));
                    Map<String, String> headers = new HashMap<String, String>();
                    headers.put("Cache-Control", "no-store");
                    return new WebResourceResponse(mimeOf(f.getName()), null, 200, "OK", headers, new FileInputStream(f));
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
                }
            }
            try {
                InputStream in = getAssets().open("www" + Uri.decode(path));
                // a WebView older than Chrome 97 does not know 'wasm-unsafe-eval' (needed by the PDF
                // and text-recognition engines): only there the page keeps the older, wider permission
                if ("/index.html".equals(path) && webViewMajor() < 97) {
                    String html = new String(readAll(in), "UTF-8").replace("script-src 'self' acm: 'wasm-unsafe-eval'", "script-src 'self' acm: 'unsafe-eval' 'wasm-unsafe-eval'");
                    in = new java.io.ByteArrayInputStream(html.getBytes("UTF-8"));
                }
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mimeOf(path), null, 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri u = Uri.parse(url);
            if (HOST.equals(u.getHost())) return false;
            // only web links and e-mail leave the app; intent:, content:, file: and other apps' links are ignored
            String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase(java.util.Locale.ROOT);
            if (!sc.equals("https") && !sc.equals("http") && !sc.equals("mailto")) return true;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* nothing to open it */ }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageLoaded = true;
        }
    }

    class Chrome extends WebChromeClient {
        /** Live camera for the QR scanner: only for the app's own page, only the camera. */
        @Override
        public void onPermissionRequest(final PermissionRequest req) {
            boolean ours = req.getOrigin() != null && HOST.equals(req.getOrigin().getHost());
            boolean onlyCamera = true;
            for (String r : req.getResources()) if (!PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) onlyCamera = false;
            if (!ours || !onlyCamera) { req.deny(); return; }
            ui.post(new Runnable() { @Override public void run() {
                withCamera(new Runnable() { @Override public void run() { req.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }); } },
                    new Runnable() { @Override public void run() { req.deny(); } });
            } });
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.d(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (chooserCb != null) chooserCb.onReceiveValue(null);
            chooserCb = cb;
            try {
                startActivityForResult(params.createIntent(), REQ_CHOOSER);
            } catch (Exception e) {
                chooserCb = null;
                return false;
            }
            return true;
        }
    }
}
