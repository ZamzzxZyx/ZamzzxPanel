#!/usr/bin/env python3
"""Membuat proyek Android dari builds/<id>.zip (config.json, icons, splash, www)."""
import html
import json
import os
import sys
import zipfile

ANIM = {"none": 0, "fade": 1, "zoom": 2, "slide": 3, "pulse": 4}
LOADER = {"none": 0, "bar": 1, "spinner": 2, "dots": 3}
ORIENT = {"auto": 0, "portrait": 1, "landscape": 2}
CACHE = {"default": 0, "network": 1, "offline": 2}


def jstr(s):
    return json.dumps(s, ensure_ascii=True)


def col(h):
    return "0xFF" + h.lstrip("#").upper()


def jbool(v):
    return "true" if v else "false"


def xml_text(s):
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = s.replace("'", "\\'").replace('"', '\\"')
    if s[:1] in ("@", "?"):
        s = "\\" + s
    return s


def write(path, data, mode="w"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode, **({"encoding": "utf-8"} if "b" not in mode else {})) as f:
        f.write(data)


def main():
    z = zipfile.ZipFile(sys.argv[1])
    cfg = json.loads(z.read("config.json").decode("utf-8"))
    names = set(z.namelist())
    app = os.path.join(os.getcwd(), "app")
    main_dir = os.path.join(app, "src", "main")
    res = os.path.join(main_dir, "res")

    sp, ui, web, perms, err = cfg["splash"], cfg["ui"], cfg["web"], cfg["perms"], cfg["error"]

    # ---- Ikon dan logo splash ----
    for size, dpi in ((48, "mdpi"), (72, "hdpi"), (96, "xhdpi"), (144, "xxhdpi"), (192, "xxxhdpi")):
        write(os.path.join(res, "mipmap-" + dpi, "ic_launcher.png"), z.read("icons/%d.png" % size), "wb")
    splash_src = "splash.png" if "splash.png" in names else "icons/512.png"
    write(os.path.join(res, "drawable-nodpi", "splash_logo.png"), z.read(splash_src), "wb")

    # ---- Isi web offline ----
    bundled = "www/index.html" in names
    if bundled:
        base = os.path.join(main_dir, "assets")
        for n in z.namelist():
            if not n.startswith("www/") or n.endswith("/"):
                continue
            target = os.path.normpath(os.path.join(base, n))
            if not target.startswith(base + os.sep):
                raise SystemExit("Path tidak valid: " + n)
            write(target, z.read(n), "wb")
        start_url = "file:///android_asset/www/index.html"
    else:
        start_url = cfg["url"]

    # ---- build.gradle modul ----
    write(os.path.join(app, "build.gradle"), """plugins {
    id 'com.android.application'
}

android {
    namespace 'com.panel.webview'
    compileSdk 34

    defaultConfig {
        applicationId %s
        minSdk 21
        targetSdk 34
        versionCode %d
        versionName %s
    }

    signingConfigs {
        release {
            storeFile file('../signing/panel.jks')
            storePassword 'panel-build'
            keyAlias 'panel'
            keyPassword 'panel-build'
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}

dependencies {
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
}
""" % (jstr(cfg["pkg"]), int(cfg["versionCode"]), jstr(cfg["versionName"])))

    # ---- Manifest dan izin ----
    p = ['    <uses-permission android:name="android.permission.INTERNET"/>',
         '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>']
    if perms["camera"]:
        p += ['    <uses-permission android:name="android.permission.CAMERA"/>',
              '    <uses-feature android:name="android.hardware.camera" android:required="false"/>']
    if perms["microphone"]:
        p += ['    <uses-permission android:name="android.permission.RECORD_AUDIO"/>',
              '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>']
    if perms["location"]:
        p += ['    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>',
              '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>',
              '    <uses-feature android:name="android.hardware.location" android:required="false"/>']
    if perms["storage"]:
        p += ['    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>',
              '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>',
              '    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>',
              '    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>',
              '    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>']
    if perms["notifications"]:
        p.append('    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>')
    if perms["vibrate"]:
        p.append('    <uses-permission android:name="android.permission.VIBRATE"/>')

    manifest = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

%s

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:theme="@style/AppTheme"
        android:allowBackup="false"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
""" % "\n".join(p)
    write(os.path.join(main_dir, "AndroidManifest.xml"), manifest)

    # ---- Resource nilai ----
    write(os.path.join(res, "values", "strings.xml"),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">%s</string>\n</resources>\n' % xml_text(cfg["name"]))
    write(os.path.join(res, "values", "colors.xml"),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="window_bg">%s</color>\n</resources>\n' % sp["bg"])
    write(os.path.join(res, "values", "styles.xml"),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
          '    <style name="AppTheme" parent="android:Theme.Material.Light.NoActionBar">\n'
          '        <item name="android:windowBackground">@color/window_bg</item>\n'
          '    </style>\n</resources>\n')

    # ---- AppConfig.java ----
    hosts = ", ".join(jstr(h) for h in web["allowedHosts"])
    lines = [
        "package com.panel.webview;",
        "",
        "public final class AppConfig {",
        "    private AppConfig() {}",
        "    public static final String APP_NAME = %s;" % jstr(cfg["name"]),
        "    public static final String VERSION_NAME = %s;" % jstr(cfg["versionName"]),
        "    public static final String START_URL = %s;" % jstr(start_url),
        "    public static final boolean SPLASH = %s;" % jbool(sp["enabled"]),
        "    public static final int SPLASH_BG = %s;" % col(sp["bg"]),
        "    public static final int SPLASH_FG = %s;" % col(sp["fg"]),
        "    public static final String TAGLINE = %s;" % jstr(sp["tagline"]),
        "    public static final int SPLASH_ANIM = %d;" % ANIM[sp["anim"]],
        "    public static final long SPLASH_MS = %dL;" % int(sp["durationMs"]),
        "    public static final int SPLASH_LOADER = %d;" % LOADER[sp["loader"]],
        "    public static final boolean SHOW_VERSION = %s;" % jbool(sp["showVersion"]),
        "    public static final int ORIENTATION = %d;" % ORIENT[ui["orientation"]],
        "    public static final boolean FULLSCREEN = %s;" % jbool(ui["fullscreen"]),
        "    public static final int STATUS_BAR = %s;" % col(ui["statusBar"]),
        "    public static final int NAV_BAR = %s;" % col(ui["navBar"]),
        "    public static final boolean KEEP_ON = %s;" % jbool(ui["keepScreenOn"]),
        "    public static final boolean PULL_REFRESH = %s;" % jbool(ui["pullToRefresh"]),
        "    public static final boolean TOP_PROGRESS = %s;" % jbool(ui["topProgress"]),
        "    public static final int PROGRESS_COLOR = %s;" % col(ui["progressColor"]),
        "    public static final boolean EXIT_CONFIRM = %s;" % jbool(ui["exitConfirm"]),
        "    public static final boolean JS = %s;" % jbool(web["js"]),
        "    public static final boolean ZOOM = %s;" % jbool(web["zoom"]),
        "    public static final String USER_AGENT = %s;" % jstr(web["userAgent"]),
        "    public static final boolean EXTERNAL_BROWSER = %s;" % jbool(web["externalLinks"] == "browser"),
        "    public static final String[] ALLOWED_HOSTS = new String[] { %s };" % hosts,
        "    public static final int CACHE = %d;" % CACHE[web["cache"]],
        "    public static final boolean FILE_UPLOAD = %s;" % jbool(web["fileUpload"]),
        "    public static final boolean DOWNLOADS = %s;" % jbool(web["downloads"]),
        "    public static final boolean MIXED = %s;" % jbool(web["mixedContent"]),
        "    public static final boolean PERM_CAMERA = %s;" % jbool(perms["camera"]),
        "    public static final boolean PERM_MIC = %s;" % jbool(perms["microphone"]),
        "    public static final boolean PERM_LOCATION = %s;" % jbool(perms["location"]),
        "    public static final boolean PERM_STORAGE = %s;" % jbool(perms["storage"]),
        "    public static final boolean PERM_NOTIF = %s;" % jbool(perms["notifications"]),
        "    public static final String ERR_TITLE = %s;" % jstr(html.escape(err["title"])),
        "    public static final String ERR_MESSAGE = %s;" % jstr(html.escape(err["message"])),
        "    public static final String ERR_BUTTON = %s;" % jstr(html.escape(err["button"])),
        "}",
        "",
    ]
    write(os.path.join(main_dir, "java", "com", "panel", "webview", "AppConfig.java"), "\n".join(lines))
    print("Proyek dibuat untuk", cfg["name"], "(%s)" % cfg["pkg"], "| offline:" , bundled)


if __name__ == "__main__":
    main()
