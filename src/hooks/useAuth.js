import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase.js";

// Returns the current Firebase user. `undefined` = loading, `null` = signed out.
export function useAuth() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u ?? null)), []);
  return user;
}
