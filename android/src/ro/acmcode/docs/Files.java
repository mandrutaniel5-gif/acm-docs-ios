package ro.acmcode.docs;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Lets other apps (camera, WhatsApp, e-mail, PDF viewers) read or write one of our files, when we allow it. */
public class Files extends ContentProvider {
    static final String AUTHORITY = "ro.acmcode.docs.files";

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).encodedPath(Uri.encode(f.getAbsolutePath(), "/")).build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    File fileFor(Uri uri) throws FileNotFoundException {
        String p = uri.getPath();
        if (p == null) throw new FileNotFoundException();
        File f = new File(p);
        String c;
        try { c = f.getCanonicalPath(); } catch (IOException e) { throw new FileNotFoundException(); }
        File[] roots = new File[] {
            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "ACM Docs"),
            getContext().getExternalFilesDir(null), getContext().getFilesDir(), getContext().getCacheDir(),
        };
        for (File r : roots) {
            if (r == null) continue;
            try {
                String rc = r.getCanonicalPath();
                if (c.equals(rc) || c.startsWith(rc + "/")) return f;
            } catch (IOException e) {
                // next
            }
        }
        throw new FileNotFoundException("not shared: " + p);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String p = uri.getPath();
        return MainActivity.mimeOf(p == null ? "" : p);
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (mode.contains("w")) {
            File dir = f.getParentFile();
            if (dir != null) dir.mkdirs();
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
