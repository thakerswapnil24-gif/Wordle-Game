# Publishing Pentaword to Google Play

Everything in this repository is ready to ship. The only steps that cannot be
automated are the ones that require your signing key and your Play Console
account — this document walks through those in order.

Budget roughly **20 minutes of setup**, then **14 days of closed testing** if
your Play developer account is a new personal one (see step 6).

---

## Step 0 — Decide the name and package name (do this first)

Two values are **permanent once the first build is uploaded** and cannot be
changed afterwards without publishing a brand new listing:

| Value | Current | Where it lives |
| --- | --- | --- |
| Application ID | `io.github.thakerswapnil24.pentaword` | `capacitor.config.json`, `android/app/build.gradle` (×2), `android/app/src/main/res/values/strings.xml`, and the Java package directory |
| App name | `Pentaword` | `src/js/config.js` (`BRAND.name`), `android/app/src/main/res/values/strings.xml` |

Before you upload anything, search the Play Store and a trademark register for
the name you intend to use. Two minutes of searching now is much cheaper than a
forced rename after launch.

To change the application ID, run:

```bash
OLD=io.github.thakerswapnil24.pentaword
NEW=com.example.yourname.pentaword
grep -rl "$OLD" android capacitor.config.json | xargs sed -i "s/$OLD/$NEW/g"
git mv android/app/src/main/java/io/github/thakerswapnil24/pentaword \
        android/app/src/main/java/<your/new/path>
npm run sync:android
```

---

## Step 1 — Create your upload key

Google signs the app that reaches players; you sign the bundle you upload to
Google. That upload key is generated once and used for every release forever.

```bash
keytool -genkeypair -v \
  -keystore upload.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12
```

It asks for a password and some identity fields; the identity fields are not
shown to players, so anything accurate is fine.

> **Back this file up somewhere you will still have in five years**, along with
> its password. Losing it means you can no longer publish updates to the
> listing — you would have to publish a new app under a new package name and
> ask every player to reinstall. Do not commit it: `*.jks` is git-ignored, and
> it must never enter version control.

## Step 2 — Add the key to GitHub as secrets

```bash
base64 -w0 upload.jks > upload.jks.base64   # macOS: base64 -i upload.jks -o upload.jks.base64
```

In the repository, go to **Settings → Secrets and variables → Actions → New
repository secret** and add four secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the entire contents of `upload.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 1 |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (the same as the store password unless you set a different one) |

Then delete `upload.jks.base64` from your machine — the keystore itself is the
copy worth keeping.

## Step 3 — Build the signed bundle

Either push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

…or go to **Actions → Release bundle → Run workflow** and type the version by
hand.

When the run finishes, open it and download the **`pentaword-1.0.0-aab`**
artifact. Inside is `app-release.aab` — that is the file you upload to Play.

> The workflow refuses to produce an unsigned bundle: it fails if the keystore
> secret is missing, and verifies a signature block is present before uploading
> the artifact.

**Version numbers.** Play requires `versionCode` to increase with every upload,
and a code that has been used can never be reused. Tags map to it automatically:
`v1.0.0` → `10000`, `v1.2.3` → `10203`.

The tag must be exactly three numeric parts, and **minor and patch must each stay
below 100** — otherwise `v1.0.100` and `v1.1.0` would both produce `10100` and
Play would reject the second upload as a duplicate. Anything else (`v1.2`,
`v1.2.3-beta`) is refused with a clear message rather than being guessed at; see
`tools/version-code.sh`, which is covered by `tests/version-code.test.js`.

Manual runs let you set the name and code directly, and validate both.

## Step 4 — Create the app in the Play Console

1. Sign in at <https://play.google.com/console> (a one-off $25 registration fee
   applies if you have not before).
2. **Create app** → name `Pentaword`, language English, type **Game**, free.
3. Work through the **Dashboard** checklist. The content you need is prepared:

| Play asks for | Use |
| --- | --- |
| App icon (512×512) | `store/icon-512.png` |
| Feature graphic (1024×500) | `store/feature-graphic.png` |
| Phone screenshots | `store/screenshots/phone-*.png` |
| Tablet screenshots (7" and 10") | `store/screenshots/tablet-*.png` |
| Short and full description | `docs/play-listing.md` |
| Privacy policy URL | see step 5 |
| Data safety answers | `docs/play-listing.md` |
| Content rating questionnaire | `docs/play-listing.md` has the answers |
| Category | Games → Word |

4. **Release → Testing → Closed testing** (or Internal testing first), create a
   release, and upload the `.aab`.

## Step 5 — Publish the privacy policy

Play requires a publicly reachable privacy policy URL even for an app that
collects nothing. `docs/privacy-policy.html` is ready to host, and carries its
own copy of the logo so it works standalone.

In the repository, go to **Settings → Pages**, set the source to
**Deploy from a branch**, branch `main`, folder `/docs`, and save. After a
minute the policy is live at:

```
https://<your-github-username>.github.io/<repository-name>/privacy-policy.html
```

Paste that URL into the Play Console listing.

## Step 6 — Closed testing, then production

If your developer account is a **personal account created after November 2023**,
Google requires a closed test with **at least 12 testers who stay opted in for
14 continuous days** before you may apply for production access. Start this as
early as you can — it is the longest part of the whole process.

Organisation accounts are not subject to this requirement and can go straight to
production review.

Once the requirement is satisfied: **Release → Production → Create new release**,
promote the tested bundle, and submit for review. First reviews typically take a
few days.

## Releasing an update later

```bash
git tag v1.0.1 && git push origin v1.0.1
```

Download the new artifact, upload it to a new Play release, write the release
notes, and roll out. Nothing else changes — the signing key and listing stay
as they are.

---

## Building locally instead

If you would rather not use CI, install Android Studio (which brings the SDK)
and run:

```bash
npm ci
npm run sync:android      # stages www/ and copies it into the Android project
npm run open:android      # opens the project in Android Studio
```

Then **Build → Generate Signed App Bundle**, pointing at your `upload.jks`.
From the command line:

```bash
cd android
./gradlew bundleRelease \
  -Ppentaword.versionName=1.0.0 -Ppentaword.versionCode=10000 \
  -Ppentaword.keystore=/absolute/path/upload.jks \
  -Ppentaword.storePassword=… -Ppentaword.keyAlias=upload -Ppentaword.keyPassword=…
```

The bundle lands in `android/app/build/outputs/bundle/release/`.

## Troubleshooting

**"Your app targets API level N — it must target 36 or higher."**
Bump `compileSdkVersion` and `targetSdkVersion` in `android/variables.gradle`.
Google raises the required level every August.

**"You uploaded an APK or Android App Bundle that is signed with a key that is
also used to sign APKs delivered to users."**
You reused a debug key. Rebuild with the release workflow.

**"Version code N has already been used."**
Increase the version and tag again; version codes may never be reused.

**The app shows "Pentaword could not start" on a device.**
The web assets were not synced into the project. Run `npm run sync:android`
and rebuild — CI does this automatically.
