# Deploy to Firebase — Step-by-step

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it (e.g. `dtn-careerpath`) → Continue
3. Disable Google Analytics if you don't need it → **Create project**

## 2. Enable Firestore

1. In the sidebar: **Build → Firestore Database**
2. Click **Create database** → choose **Production mode** → select a region close to you (e.g. `asia-southeast1`) → **Enable**

## 3. Enable Google Authentication

1. In the sidebar: **Build → Authentication**
2. Click **Get started** → **Sign-in method** tab
3. Click **Google** → toggle **Enable** → enter your support email → **Save**

## 4. Register the web app and get config

1. In the sidebar: click the gear icon → **Project settings**
2. Scroll to **Your apps** → click the `</>` (Web) icon
3. Register app (nickname: `careerpath`) — no need to enable Hosting here
4. Copy the `firebaseConfig` object values

## 5. Paste config into index.html

Open `index.html` and find the `firebaseConfig` block near the bottom. Replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            'AIza...',
  authDomain:        'your-project-id.firebaseapp.com',
  projectId:         'your-project-id',
  storageBucket:     'your-project-id.appspot.com',
  messagingSenderId: '123456789',
  appId:             '1:123...'
};
```

Also update `.firebaserc` — replace `YOUR_PROJECT_ID` with your actual project ID.

## 6. Deploy Firestore security rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## 7. Enable Firebase Hosting and deploy the site

```bash
firebase deploy --only hosting
```

The CLI will print your public URL:
```
Hosting URL: https://your-project-id.web.app
```

Your site is now live.

## How the data works

| Feature | Who can write | Who can read |
|---|---|---|
| Roadmap checkboxes | Owner only (Google sign-in with `thanhnguyen187201@gmail.com`) | Everyone |
| Visitor comments | Anyone | Everyone |

- Click the 🔒 icon (top-right of the nav) to sign in as owner and edit your roadmap progress.
- Progress syncs across all your devices in real time via Firestore.
- Visitors see your actual checked progress (read-only).
- Visitor messages are stored in Firestore and appear instantly on the page.

## Custom domain (optional)

In Firebase Console → **Hosting** → **Add custom domain** → follow the DNS verification steps.
