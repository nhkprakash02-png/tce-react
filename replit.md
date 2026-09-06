# Replit setup

This project is a Vite + React application.

## Run

Use the **Start application** workflow, which runs:

```bash
npm run dev
```

The Vite development server is configured to listen on `0.0.0.0:5000` and allow
Replit's proxied preview hosts.

## Firebase

Firebase configuration can be supplied with the `VITE_FIREBASE_*` variables
listed in `.env.example`. If they are absent, `src/firebase.js` falls back to
the existing `tce-nahata` Firebase project, so local development may read or
write live project data depending on its Firestore security rules.

Before publishing, replace the client-side admin password flow with proper
authentication and verify the Firebase Auth authorized domains and Firestore
security rules.