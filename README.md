# Welcome to your Expo app 👋

LifeFlow is an Expo React Native application built with Expo Router and TypeScript.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

Application routes live in **src/app**. Shared code also lives under **src**, while static assets remain in the root **assets** directory.

## Android preview APK and direct FCM setup

The `preview` profile in `eas.json` builds an internal-distribution Android APK
with bundled JavaScript. It does not require a development client or Metro.
This configuration alone does not link an Expo account, create credentials,
build an APK, or establish successful push delivery.

LifeFlow uses native Android tokens from `getDevicePushTokenAsync()` and the
Laravel FCM HTTP v1 sender. Do not switch to Expo Push Service or upload the
backend service-account key to EAS. Android remote push requires a native build;
it is unavailable in Expo Go on SDK 53 and later.

Complete these manual setup steps in order. Do not start a build or send a test
notification until the later live-test stage is approved.
In Windows PowerShell with script execution disabled, use `npx.cmd` instead of
`npx` in the commands below.

1. In Firebase Console, select the existing LifeFlow project. Under Project
   settings, confirm the registered Android package is `com.lifeflow.capstone`
   and matches `app.json` and the Android client in `google-services.json`.
   Keep the existing project and identifiers. Confirm Firebase Cloud Messaging
   API (HTTP v1) is enabled in the matching Google Cloud project.
2. Reuse a suitable private server service account if one already exists.
   Otherwise, an authorized project owner can provision a dedicated sender
   account/key privately. Prefer a custom role granting only
   `cloudmessaging.messages.create` on the matching project; do not grant
   Owner/Editor just to send notifications. In Google Cloud Console for that
   Firebase project, use IAM & Admin to create/grant the role to the dedicated
   service account; only if a new key is needed, open its Keys tab, choose
   Add key > Create new key > JSON, and move the download directly into the
   private server location. The current Laravel sender requires
   a service-account JSON file containing `project_id`, `client_email` and
   `private_key`; it does not use Android client config or automatic ADC.
3. Store that JSON outside all project repositories and the public web root.
   For example, use an administrator-managed directory outside the checkout on
   Windows, or `/etc/lifeflow/secrets/fcm-service-account.json` on Linux. Restrict
   directory access and grant read access only to the Laravel runtime/queue
   worker identity (for example, owner-only `0600` when that identity owns the
   file). Never copy it into this mobile project, Git, EAS, or public storage.
4. In the backend's private environment, set `FCM_PROJECT_ID` to the matching
   Firebase project ID and `FCM_CREDENTIALS` to the absolute server JSON path.
   Keep `FCM_ENABLED=false` during readiness work. Enable it only when controlled
   live testing is approved. After any server configuration change, run
   `php artisan config:cache` and `php artisan queue:restart` in the backend;
   these commands are manual and can affect running services.
5. From `lifeflow-frontend`, run `npx eas-cli@latest login` yourself and select the
   intended Expo account. Then run `npx eas-cli@latest init` and link the intended
   existing EAS project, or explicitly create one if none exists. This writes the
   real `extra.eas.projectId`; never invent or copy another project's UUID.
   Check the resulting `app.json` diff before continuing.
6. Once Laravel is deployed over HTTPS, set `EXPO_PUBLIC_API_URL` in the linked
   EAS project's **preview** environment through the Expo dashboard. Use the
   real device-reachable Laravel API base URL including `/api`. The URL is
   public application configuration. Do not put FCM/R2 credentials in any
   `EXPO_PUBLIC_*` variable. Local ignored `.env` files will not reach EAS.
   Do not use localhost or a LAN address for remote group testing. Changing this
   value after an APK is built requires a new build with the current setup.
7. Keep the existing tracked `google-services.json` available at the configured
   path. It is Android client configuration, not a server private key. No
   `.easignore` overrides `.gitignore`, and this file is not ignored, so it is
   included in the normal EAS project archive. Do not remove/ignore it without
   first arranging a replacement build-time file source. Server keys must never
   be added to the mobile archive.
8. Before a later approved build, review Android signing with
   `npx eas-cli@latest credentials --platform android`. Reuse the existing
   keystore if this package was already distributed; otherwise explicitly let
   EAS manage a new keystore. Signing credentials are separate from FCM sender
   credentials. No Firebase sender-key upload to Expo is needed for direct FCM.

Later, after F03 lifecycle/queue work and explicit build approval, the command is
`npx eas-cli@latest build --platform android --profile preview`. Do not run it
as part of configuration-only F02. Distribute the APK, not an AAB, to the test
group; protect the distribution link appropriately.

For later F03/F04 deployment, the backend needs a supervised
`php artisan queue:work database --queue=default --timeout=60 --tries=1` process
with `DB_QUEUE_RETRY_AFTER=90` and a scheduler calling
`php artisan schedule:run` every minute (or `schedule:work` for local testing).
The scheduler already runs donation reminders and cooldown completion hourly.
Provisioning services is a separate approved deployment action. The push job
timeout is 60 seconds (previously 120), strictly below the 90-second database
queue retry interval. Keep at least this 30-second margin when configuring the
worker; on Linux use a supervised worker with PCNTL for enforced timeouts.
Other queue connections need their own reservation/visibility timeout above
60 seconds too. F03 preserves the atomic one-attempt delivery gate: transient
FCM errors and ambiguous network timeouts are not automatically replayed, since
FCM may already have accepted a message. Durable per-device recovery would need
a separate reviewed design. Provider failures are recorded as `push_status`,
not necessarily in `failed_jobs`; monitor both when deploying.
Enabling FCM does not automatically replay historical failed/not-configured jobs.

The mobile refresh listener registers its supplied native token without fetching
another token. Registration is serialized per login, deduplicated, and refreshed
at most daily while the app is used. Logout invalidates pending registration
work immediately, and server-side unregister affects only the current login.
If permission is revoked during a session, its known token is unregistered.
After a restart with permission already denied there is no retained token to
unregister; offline logout also cannot guarantee immediate server revocation.
These cases remain limited by OS permission, token transfer on a later login,
server session expiry/revocation and the sender's 30-day last-seen cutoff. No new
durable device-token storage or automatic permission reprompt was added.

F04 must verify foreground, background, terminated-app taps, permission denial,
logout/account switching and remote group access on real Android devices. The
current foreground handler intentionally refreshes the inbox without showing a
banner or playing sound. In-app history must continue working without push.

References: [APK profiles](https://docs.expo.dev/build-reference/apk/),
[EAS environments](https://docs.expo.dev/eas/environment-variables/),
[direct FCM with Expo](https://docs.expo.dev/push-notifications/sending-notifications-custom/),
[FCM authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api),
[FCM permissions](https://firebase.google.com/docs/projects/iam/permissions).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Expo Router documentation](https://docs.expo.dev/router/introduction/): Learn about file-based routing and navigation.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
