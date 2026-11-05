import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.startsWith("YOUR_")
);

let quotaExceeded = false;
const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isQuotaExceeded() {
  return quotaExceeded;
}

export function onQuota(listener: (exceeded: boolean) => void) {
  quotaListeners.add(listener);
  listener(quotaExceeded);
  return () => {
    quotaListeners.delete(listener);
  };
}

export function noteQuota() {
  if (quotaExceeded) return;
  quotaExceeded = true;
  setLogLevel("silent");
  quotaListeners.forEach((listener) => listener(true));
}

export function clearQuota() {
  if (!quotaExceeded) return;
  quotaExceeded = false;
  setLogLevel("error");
  quotaListeners.forEach((listener) => listener(false));
}

function watchQuotaLogs() {
  if (typeof window === "undefined") return;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((item) => String(item)).join(" ");
    if (text.includes("resource-exhausted") || text.includes("Quota exceeded")) {
      noteQuota();
      return;
    }
    original(...args);
  };
}

watchQuotaLogs();

export function getFirebase() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}
