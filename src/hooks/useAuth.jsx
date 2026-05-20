import { useState, useEffect, useContext, createContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase.js";

const AuthContext = createContext(undefined);

// Wrap your app in this provider — a single onAuthStateChanged listener
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u ?? null)), []);
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

// Returns the current Firebase user. `undefined` = loading, `null` = signed out.
export function useAuth() {
  return useContext(AuthContext);
}
