package com.shishuo.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 系统相册授权 + 全库选图。
 *
 * 与 WebView 的 <input type=file> 不同：这里会先走安卓运行时权限
 * （READ_MEDIA_IMAGES / READ_EXTERNAL_STORAGE），授权后打开系统相册，
 * 用户可以从整个相册里选图。拒绝时由网页显示“去授权”页。
 */
@CapacitorPlugin(
    name = "PhotoAccess",
    permissions = {
        @Permission(alias = "images", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class PhotoAccessPlugin extends Plugin {

    private static final int MAX_FILES = 6;
    private static final int MAX_EDGE = 1600;
    private static final int JPEG_QUALITY = 85;

    private boolean hasAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPermissionState("images") == PermissionState.GRANTED;
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", hasAccess() ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasAccess()) {
            JSObject ret = new JSObject();
            ret.put("status", "granted");
            call.resolve(ret);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("images", call, "permissionCallback");
        } else {
            requestPermissionForAlias("storage", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", hasAccess() ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void openGallery(PluginCall call) {
        if (!hasAccess()) {
            JSObject ret = new JSObject();
            ret.put("status", "denied");
            call.resolve(ret);
            return;
        }
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "galleryResult");
        } catch (ActivityNotFoundException error) {
            JSObject ret = new JSObject();
            ret.put("status", "unavailable");
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void galleryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount() && uris.size() < MAX_FILES; index++) {
                Uri uri = clip.getItemAt(index).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        JSArray files = new JSArray();
        JSArray errors = new JSArray();
        for (Uri uri : uris) {
            try {
                JSObject file = readImage(uri);
                if (file != null) files.put(file);
            } catch (Exception error) {
                errors.put(error.getMessage() == null ? "读取图片失败" : error.getMessage());
            }
        }

        JSObject ret = new JSObject();
        ret.put("files", files);
        if (errors.length() > 0) ret.put("errors", errors);
        call.resolve(ret);
    }

    private JSObject readImage(Uri uri) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        String name = queryName(resolver, uri);
        byte[] bytes = compress(uri, resolver);
        if (bytes.length == 0) throw new IOException("图片为空");
        if (bytes.length > 8 * 1024 * 1024) throw new IOException("图片过大，请先压缩");

        JSObject file = new JSObject();
        file.put("name", jpegName(name));
        file.put("mime", "image/jpeg");
        file.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        return file;
    }

    private String queryName(ContentResolver resolver, Uri uri) {
        try (android.database.Cursor cursor = resolver.query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.isEmpty()) return value;
                }
            }
        } catch (Exception ignored) {
            // 部分相册不返回 DISPLAY_NAME，回退到 URI 末段。
        }
        String last = uri.getLastPathSegment();
        return last == null || last.isEmpty() ? "photo.jpg" : last;
    }

    private String jpegName(String name) {
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        return base + ".jpg";
    }

    private byte[] compress(Uri uri, ContentResolver resolver) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) throw new IOException("无法读取图片");
            BitmapFactory.decodeStream(input, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IOException("无法识别图片格式");
        }

        int sample = 1;
        while (
            bounds.outWidth / (sample * 2) >= MAX_EDGE || bounds.outHeight / (sample * 2) >= MAX_EDGE
        ) {
            sample *= 2;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) throw new IOException("无法读取图片");
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) throw new IOException("无法解码图片");

        int rotation = readRotation(uri, resolver);
        if (rotation != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotation);
            Bitmap rotated = Bitmap.createBitmap(
                bitmap,
                0,
                0,
                bitmap.getWidth(),
                bitmap.getHeight(),
                matrix,
                true
            );
            if (rotated != bitmap) bitmap.recycle();
            bitmap = rotated;
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        float scale = Math.min(1f, Math.min((float) MAX_EDGE / width, (float) MAX_EDGE / height));
        if (scale < 1f) {
            Bitmap scaled = Bitmap.createScaledBitmap(
                bitmap,
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
                true
            );
            bitmap.recycle();
            bitmap = scaled;
        }

        // JPEG 不支持透明通道，先铺白底，避免截图/PNG 变黑。
        Bitmap flattened = Bitmap.createBitmap(
            bitmap.getWidth(),
            bitmap.getHeight(),
            Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(flattened);
        canvas.drawColor(Color.WHITE);
        canvas.drawBitmap(bitmap, 0, 0, null);
        bitmap.recycle();

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        flattened.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output);
        flattened.recycle();
        return output.toByteArray();
    }

    private int readRotation(Uri uri, ContentResolver resolver) {
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) return 0;
            ExifInterface exif = new ExifInterface(input);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (Exception ignored) {
            return 0;
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法打开系统设置");
        }
    }
}
