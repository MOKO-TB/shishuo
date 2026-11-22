package com.shishuo.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
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
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * 原生图片与相机桥：
 * - 系统相册授权（含 Android 14+ READ_MEDIA_VISUAL_USER_SELECTED 有限访问兼容）+ 全库选图；
 * - 原生拍照拍题/拍板书（CAMERA 权限 + FileProvider + EXIF 旋转 + 1600px 压缩）；
 * - 保存图片到系统相册（MediaStore，Android 10+ 无需存储权限）。
 */
@CapacitorPlugin(
    name = "PhotoAccess",
    permissions = {
        @Permission(
            alias = "images",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            }
        ),
        @Permission(alias = "images33", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
    }
)
public class PhotoAccessPlugin extends Plugin {

    private static final int MAX_FILES = 6;
    private static final int MAX_EDGE = 1600;
    private static final int JPEG_QUALITY = 85;

    private File pendingPhotoFile;
    private Uri pendingPhotoUri;

    private boolean hasAccess() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            boolean full =
                ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) ==
                PackageManager.PERMISSION_GRANTED;
            boolean limited =
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
                ) == PackageManager.PERMISSION_GRANTED;
            return full || limited;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPermissionState("images33") == PermissionState.GRANTED;
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    private boolean hasCameraAccess() {
        return (
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        );
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            requestPermissionForAlias("images", call, "permissionCallback");
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("images33", call, "permissionCallback");
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
    public void checkCameraAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", hasCameraAccess() ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void takePhoto(PluginCall call) {
        if (!hasCameraAccess()) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (!hasCameraAccess()) {
            JSObject ret = new JSObject();
            ret.put("status", "denied");
            call.resolve(ret);
            return;
        }
        launchCamera(call);
    }

    private void launchCamera(PluginCall call) {
        Context context = getContext();
        try {
            File dir = new File(context.getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) {
                JSObject ret = new JSObject();
                ret.put("status", "unavailable");
                ret.put("message", "无法创建临时拍照目录");
                call.resolve(ret);
                return;
            }
            cleanupPendingPhoto();
            String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            pendingPhotoFile = new File(dir, "shishuo_" + stamp + ".jpg");
            pendingPhotoUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                pendingPhotoFile
            );

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhotoUri);
            intent.setClipData(ClipData.newRawUri("photo", pendingPhotoUri));
            intent.addFlags(
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
            List<android.content.pm.ResolveInfo> handlers = context
                .getPackageManager()
                .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (android.content.pm.ResolveInfo info : handlers) {
                context.grantUriPermission(
                    info.activityInfo.packageName,
                    pendingPhotoUri,
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            }
            startActivityForResult(call, intent, "cameraResult");
        } catch (ActivityNotFoundException error) {
            cleanupPendingPhoto();
            JSObject ret = new JSObject();
            ret.put("status", "unavailable");
            ret.put("message", "未找到系统相机应用");
            call.resolve(ret);
        } catch (Exception error) {
            cleanupPendingPhoto();
            JSObject ret = new JSObject();
            ret.put("status", "unavailable");
            ret.put("message", error.getMessage() == null ? "启动相机失败" : error.getMessage());
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void cameraResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            cleanupPendingPhoto();
            return;
        }
        Uri photoUri = pendingPhotoUri;
        File photoFile = pendingPhotoFile;
        pendingPhotoUri = null;
        pendingPhotoFile = null;

        if (
            result.getResultCode() != Activity.RESULT_OK ||
            photoUri == null ||
            photoFile == null ||
            !photoFile.exists() ||
            photoFile.length() == 0
        ) {
            if (photoFile != null) photoFile.delete();
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        try {
            JSObject file = readImageStatic(getContext(), photoUri, photoFile.getName());
            JSObject ret = new JSObject();
            ret.put("file", file);
            call.resolve(ret);
        } catch (Exception error) {
            JSObject ret = new JSObject();
            ret.put("status", "error");
            ret.put("message", error.getMessage() == null ? "读取拍摄图片失败" : error.getMessage());
            call.resolve(ret);
        } finally {
            photoFile.delete();
        }
    }

    private void cleanupPendingPhoto() {
        if (pendingPhotoFile != null) {
            pendingPhotoFile.delete();
            pendingPhotoFile = null;
        }
        pendingPhotoUri = null;
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
                JSObject file = readImageStatic(getContext(), uri, null);
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

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String source = call.getString("source", "").trim();
        String name = call.getString("name", "shishuo-image.jpg").trim();
        if (source.isEmpty()) {
            call.reject("缺少图片数据");
            return;
        }
        new Thread(() -> {
            try {
                byte[] bytes = loadImageBytes(source);
                if (bytes == null || bytes.length == 0) {
                    call.reject("图片数据为空");
                    return;
                }
                String safeName = jpegName(name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(
                        MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/师说"
                    );
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                }
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("无法写入系统相册");
                    return;
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("无法打开相册输出流");
                    out.write(bytes);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.Images.Media.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                }
                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("name", safeName);
                call.resolve(ret);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "保存图片失败" : error.getMessage());
            }
        })
            .start();
    }

    private byte[] loadImageBytes(String source) throws IOException {
        if (source.startsWith("data:")) {
            int comma = source.indexOf(',');
            if (comma < 0) throw new IOException("无效的图片数据");
            return Base64.decode(source.substring(comma + 1), Base64.DEFAULT);
        }
        String urlText = source;
        if (source.startsWith("/")) {
            urlText = ShellConfig.getServerUrl(getContext()) + source;
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlText).openConnection();
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            String cookie = android.webkit.CookieManager.getInstance().getCookie(urlText);
            if (cookie != null && !cookie.isEmpty()) {
                conn.setRequestProperty("Cookie", cookie);
            }
            if (conn.getResponseCode() < 200 || conn.getResponseCode() >= 300) {
                throw new IOException("下载图片失败");
            }
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) > 0) out.write(buf, 0, len);
                return out.toByteArray();
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static JSObject readImageStatic(Context context, Uri uri, String fallbackName)
        throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String name = fallbackName != null && !fallbackName.isEmpty()
            ? fallbackName
            : queryName(resolver, uri);
        byte[] bytes = compress(uri, resolver);
        if (bytes.length == 0) throw new IOException("图片为空");
        if (bytes.length > 8 * 1024 * 1024) throw new IOException("图片过大，请先压缩");

        JSObject file = new JSObject();
        file.put("name", jpegName(name));
        file.put("mime", "image/jpeg");
        file.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        return file;
    }

    private static String queryName(ContentResolver resolver, Uri uri) {
        try (
            android.database.Cursor cursor = resolver.query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
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

    private static String jpegName(String name) {
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        return base + ".jpg";
    }

    private static byte[] compress(Uri uri, ContentResolver resolver) throws IOException {
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
            bounds.outWidth / (sample * 2) >= MAX_EDGE ||
            bounds.outHeight / (sample * 2) >= MAX_EDGE
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

    private static int readRotation(Uri uri, ContentResolver resolver) {
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
