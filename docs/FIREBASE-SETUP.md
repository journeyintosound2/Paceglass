# Setting up Firebase for Paceglass

Firebase handles two things for Paceglass:
- **Signing in.** Firebase Authentication checks email and password. Paceglass never sees or stores passwords.
- **Saving.** Cloud Firestore keeps each person's drink log, so it's backed up and works across devices.

Until `js/firebase-config.js` is filled in, the app keeps working in local-only mode: no sign-in, and data stays on the device.

This takes about 15 minutes. You'll need a Google account.

## 1. Create the project

1. Go to https://console.firebase.google.com and click **Create a project**.
2. Name it `paceglass` (or similar). Google Analytics isn't needed, so you can turn it off.

## 2. Register the web app and copy its settings

1. On the project overview page, click the **Web** icon (`</>`).
2. Give it the nickname `Paceglass`. Leave Firebase Hosting unticked, because the app is hosted on GitHub Pages.
3. Firebase shows a `firebaseConfig` block. Copy each value into `js/firebase-config.js`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` and `appId`.

These values identify the project and are designed to be public. Firebase Authentication and the security rules are what protect the data.

## 3. Turn on email and password sign-in

1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Email/Password**, turn on the first switch (not "Email link") and click **Save**.
3. Go to **Settings → Authorised domains → Add domain** and add `journeyintosound2.github.io`. `localhost` is already there for testing on your computer.

## 4. Create the database

1. Go to **Build → Firestore Database → Create database**.
2. Choose the location **australia-southeast1 (Sydney)**. This can't be changed later.
3. Start in **production mode**.
4. Open the **Rules** tab. Replace everything with the contents of `firestore.rules` from this repo, then click **Publish**.

## 5. Create your admin account

Do this in the Firebase console. Your password is typed only there, never into the code.

1. Go to **Authentication → Users → Add user**.
2. Enter your email and choose a password, then click **Add user**.
3. Copy the **User UID** shown next to your email (a long string of letters and numbers).
4. Go to **Firestore Database → Data → Start collection**:
   - Collection ID: `admins`
   - Document ID: paste your User UID
   - Add one field: `email` (string), set to your email
   - Click **Save**

That one document is what makes you an admin. To add another admin later, repeat steps 1 to 4 for their account.

## 6. Make the invite email read well (optional, recommended)

When you add someone in the admin console, Firebase sends them its **password reset** email so they can set their own password. By default that email says "Reset your password", which is confusing for a new person.

1. Go to **Authentication → Templates → Password reset** and click the pencil icon.
2. Set **Sender name** to `Paceglass`.
3. Change the subject to `Set your Paceglass password`.
4. Edit the message, for example:

   > Hi, you've been invited to use Paceglass. Follow this link to set your password: %LINK%
   > Then open https://journeyintosound2.github.io/Paceglass/ and sign in with this email.

## 7. Publish and try it

1. Commit and push in GitHub Desktop.
2. Open `https://journeyintosound2.github.io/Paceglass/admin.html` (or tap **Admin console** at the bottom of the app's sign-in screen or Settings).
3. Sign in with the account from step 5.
4. Add a test person using another email address you own. Check that the invite arrives, and look in the junk folder too.
5. Set that password from the email, then sign in to the app with it.

As an admin, you can also sign in to the app itself. You don't need to add yourself as a person.

## How access works

| Data | Who can read it | Who can change it |
|---|---|---|
| `admins/{uid}` | That admin only | Nobody from the app; set up in the console |
| `members/{email}` (name, note, active or paused) | Admins, and the person themselves | Admins |
| `userData/{uid}` (the drink log) | That person only, while active | That person only |

- **Pause access:** the person can't sign in to the app or save, and their log is kept.
- **Remove:** the person loses access straight away. Their sign-in account stays in **Authentication → Users** until you delete it there. Deleting it can't be done from the admin console, because that needs server code.
- **Admins can't read anyone's drink log through Paceglass.** That's deliberate, given what the app tracks. As the project owner, you can still see stored data in the Firebase console. Keep the project's access to yourself, and see the roadmap's end-to-end encryption item if you want to close that gap.

## Troubleshooting

- **"This account doesn't have permission to do that" in the admin console.** Check that the `admins` document ID exactly matches your User UID, and that the rules were published.
- **The invite email never arrives.** Check junk, then use **Resend invite**. Firebase's free tier sends a limited number of emails per day.
- **Sign-in fails on the live site but works locally.** Add the GitHub Pages domain under Authorised domains (step 3).
