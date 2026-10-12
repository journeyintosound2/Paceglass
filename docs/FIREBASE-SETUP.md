# Setting up Firebase for Paceglass

Firebase handles two things for Paceglass:
- **Signing in.** People sign in to the app with a personal code. Admins sign in to the admin console with email and password. Firebase Authentication checks both.
- **Saving.** Cloud Firestore keeps each person's drink log, so it's backed up and works across devices.

Anyone can also choose **Continue without signing in**. They then use Paceglass on that device only, with nothing sent to Firebase.

Until `js/firebase-config.js` is filled in, the app runs in local-only mode for everyone.

## 1. Create the project

1. Go to https://console.firebase.google.com and click **Create a project**.
2. Name it `paceglass` and turn Google Analytics off.

## 2. Register the web app and copy its settings

1. On the project overview page, click **+ Add app**, then the **Web** icon (`</>`).
2. Give it the nickname `Paceglass`, leave Firebase Hosting unticked, and click **Register app**.
3. Copy the values from the `firebaseConfig` block into `js/firebase-config.js`.

These values identify the project and are designed to be public. Firebase Authentication and the security rules protect the data.

## 3. Turn on sign-in

Personal codes use Firebase's email and password sign-in behind the scenes, so this one switch covers both codes and admins.

1. Go to **Security → Authentication → Get started → Sign-in method**.
2. Choose **Email/Password**, turn on the first switch (not "Email link") and click **Save**.
3. Under **Settings → Authorised domains**, add `journeyintosound2.github.io`.
4. Under **Settings → User actions**, make sure **Email enumeration protection** is on. It usually is by default, and it makes guessing codes harder.

## 4. Create the database and publish the rules

1. Go to **Databases & Storage → Firestore Database → Create database**, choose **australia-southeast1 (Sydney)**, and start in **production mode**.
2. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repo, and click **Publish**.

**Whenever `firestore.rules` changes in the repo, paste and publish it again.** The app and the rules need to match.

## 5. Make yourself an admin

1. Go to **Authentication → Users → Add user**, enter your email and a password, and click **Add user**. That's the only place your password goes.
2. Copy your **User UID** using the copy icon.
3. Go to **Firestore Database → Data → Start collection**:
   - Collection ID: `admins`
   - Document ID: your User UID
   - Field: `email`, type string, value: your email
   - Click **Save**

## 6. Add people

1. Open the **Admin console**. It's linked at the bottom of the app's Settings and on the sign-in screen, or go to `…/Paceglass/admin.html`.
2. Sign in with your admin email and password.
3. Enter a name (and a note if you like) and click **Create their code**.
4. Give them the code, for example `K7QM-3XRP`, however suits you: in person, by text or by email. **Copy code** puts it on your clipboard.
5. They open Paceglass, tap **Sign in**, enter the code and start working on their goals.

Other tools in the admin console:

- **New code:** replaces someone's code, for example if it was shared. The old code stops working straight away, and their log stays with them.
- **Pause access:** they can't open their log until you restore access. Nothing is deleted.
- **Remove:** their code stops working and their log is deleted.

Each code has a hidden sign-in account in **Authentication → Users**, listed as `u-xxxxxxxx@…firebaseapp.com`. Replaced and removed codes leave their hidden account behind, but it can't open anything. You can delete those accounts there if you want a tidy list.

## How access works

| Data | Who can read it | Who can change it |
|---|---|---|
| `admins/{uid}` | That admin only | Nobody from the app; set up in the console |
| `members/{id}`: name, note, code, active or paused | Admins, and the person signed in with that code | Admins |
| `accounts/{hidden email}`: links a code to a person | Admins, and that code | Admins |
| `userData/{id}`: the drink log | Only the person, while active | The person; admins can only delete it |

The admin console never shows anyone's drink log. As the Firebase project owner, you can still see stored data in the Firebase console, so keep access to the project to yourself.

## Troubleshooting

- **"Not an admin account".** The `admins` document ID must exactly match your User UID. Copy it with the copy icon rather than typing it.
- **"This account doesn't have permission" when creating codes.** Republish `firestore.rules` from the repo.
- **"That code doesn't match".** Check for confusable characters. Codes never use 0, O, 1, I or L, and the app accepts lower case and spaces.
- **Sign-in works locally but not on the live site.** Add the GitHub Pages domain under Authorised domains (step 3).
