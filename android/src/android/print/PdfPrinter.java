package android.print;

import android.app.Activity;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.File;
import java.util.HashSet;
import java.util.Set;

/**
 * Turns an HTML page into a PDF file without showing anything: a hidden WebView
 * (placed behind the app, so Android really draws it) loads the page and the
 * printing system writes it straight to a file. Never waits forever: after a
 * time limit it gives up quickly so the app can draw the PDF itself instead.
 * (Lives in android.print because the print callbacks can only be made here.)
 */
public class PdfPrinter {
    public interface Done {
        void ok(File file);
        void fail(String error);
    }

    // Strong references: a WebView nobody holds can be thrown away mid-way.
    static final Set<WebView> busy = new HashSet<WebView>();
    static final int TIMEOUT_MS = 12000;

    public static void print(final Activity activity, final ViewGroup host, String html, String baseUrl, final int widthMils, final int heightMils,
                             final int[] marginsMils, final File out, final Done done) {
        final Handler h = new Handler(Looper.getMainLooper());
        final WebView w = new WebView(activity);
        busy.add(w);
        final boolean[] finished = { false };
        final Done once = new Done() {
            @Override public void ok(File f) {
                if (finished[0]) return;
                finished[0] = true;
                cleanup(host, w);
                done.ok(f);
            }
            @Override public void fail(String e) {
                if (finished[0]) return;
                finished[0] = true;
                cleanup(host, w);
                done.fail(e);
            }
        };
        w.getSettings().setJavaScriptEnabled(false);
        w.getSettings().setAllowFileAccess(false);
        // An A4-sized page behind everything else (the app's own page covers it).
        int pxW = Math.max(400, Math.round(widthMils * 96 / 1000f)), pxH = Math.max(400, Math.round(heightMils * 96 / 1000f));
        try {
            if (host != null) host.addView(w, 0, new FrameLayout.LayoutParams(pxW, pxH));
        } catch (Exception e) {
            Log.e("ACMDocs", "print host", e);
        }
        w.setWebViewClient(new WebViewClient() {
            boolean started = false;

            @Override
            public void onPageFinished(final WebView view, String url) {
                if (started) return;
                started = true;
                h.postDelayed(new Runnable() {
                    @Override public void run() {
                        try {
                            write(view, widthMils, heightMils, marginsMils, out, once);
                        } catch (Throwable e) {
                            Log.e("ACMDocs", "print", e);
                            once.fail("NATIVE_FAILED " + e);
                        }
                    }
                }, 400);
            }
        });
        h.postDelayed(new Runnable() {
            @Override public void run() {
                if (finished[0]) return;
                Log.e("ACMDocs", "print timeout");
                once.fail("NATIVE_FAILED timeout");
            }
        }, TIMEOUT_MS);
        w.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null);
    }


    static void cleanup(final ViewGroup host, final WebView w) {
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() {
                try { if (host != null) host.removeView(w); } catch (Exception e) { /* gone */ }
                try { w.destroy(); } catch (Exception e) { /* gone */ }
                busy.remove(w);
            }
        }, 3000);
    }

    static void write(final WebView view, int widthMils, int heightMils, int[] m, final File out, final Done done) {
        final PrintDocumentAdapter adapter = view.createPrintDocumentAdapter("ACM Docs");
        PrintAttributes.MediaSize size = new PrintAttributes.MediaSize("acm_" + widthMils + "x" + heightMils, "ACM", widthMils, heightMils);
        final PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(size)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                .setMinMargins(new PrintAttributes.Margins(m[0], m[1], m[2], m[3]))
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .build();
        adapter.onStart();
        adapter.onLayout(null, attrs, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                try {
                    final ParcelFileDescriptor pfd = ParcelFileDescriptor.open(out,
                            ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
                    adapter.onWrite(new PageRange[] { PageRange.ALL_PAGES }, pfd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                        @Override
                        public void onWriteFinished(PageRange[] pages) {
                            close(pfd);
                            try { adapter.onFinish(); } catch (Throwable e) { /* ignore */ }
                            if (out.length() > 0) done.ok(out);
                            else done.fail("PDF gol.");
                        }

                        @Override
                        public void onWriteFailed(CharSequence error) {
                            close(pfd);
                            done.fail("Nu am putut scrie PDF-ul: " + error);
                        }

                        @Override
                        public void onWriteCancelled() {
                            close(pfd);
                            done.fail("Crearea PDF-ului a fost oprită.");
                        }
                    });
                } catch (Throwable e) {
                    done.fail("Nu am putut crea PDF-ul: " + e.getMessage());
                }
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                done.fail("Nu am putut așeza pagina: " + error);
            }

            @Override
            public void onLayoutCancelled() {
                done.fail("Crearea PDF-ului a fost oprită.");
            }
        }, null);
    }

    static void close(ParcelFileDescriptor p) {
        try { p.close(); } catch (Exception e) { /* ignore */ }
    }
}
