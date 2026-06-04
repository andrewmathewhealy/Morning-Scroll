// In-app privacy policy. Kept in the app (rather than an external URL) so the
// disclosure ships with the build and is always reachable from Settings.
// The YouTube API Services section is REQUIRED: the Feed plays videos through
// YouTube's embedded player and pulls metadata via the YouTube Data API, which
// obligates us to disclose that use and link to YouTube's and Google's terms.

const LAST_UPDATED = "June 2, 2026";

// Shared inline styles so the page reads as one calm document.
const heading = { fontSize: 15, fontWeight: 700, color: "#0C1A35", margin: "22px 0 8px" };
const body = { fontSize: 13, lineHeight: 1.6, color: "rgba(12,26,53,0.75)", margin: "0 0 10px" };
const link = { color: "#0C1A35", textDecoration: "underline", fontWeight: 600 };

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={link}>
      {children}
    </a>
  );
}

export default function PrivacyPolicy({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#FDF2E8", overflow: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px 48px" }}>
        <button
          onClick={onClose}
          style={{
            position: "fixed", top: 16, left: 16, zIndex: 1,
            padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(12,26,53,0.18)",
            background: "rgba(12,26,53,0.04)", color: "#0C1A35", fontSize: 13, fontWeight: 600,
            fontFamily: "'Satoshi', sans-serif", cursor: "pointer",
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0C1A35", margin: 0 }}>Privacy Policy</h1>
        <p style={{ fontSize: 12, color: "rgba(12,26,53,0.5)", margin: "6px 0 0" }}>
          Last updated: {LAST_UPDATED}
        </p>

        <p style={{ ...body, marginTop: 20 }}>
          This policy explains what information Morning Scroll collects, how it is
          used, and the third-party services the app relies on. By using the app
          you agree to the practices described here.
        </p>

        <h2 style={heading}>Information we collect</h2>
        <p style={body}>
          <strong>Account information.</strong> If you sign in, we use Google
          Firebase Authentication to create and secure your account. We store the
          account identifier it provides so we can save your settings and content.
        </p>
        <p style={body}>
          <strong>Your preferences and activity.</strong> Settings such as your
          chosen background and reminders, the channels you follow, and which
          items you have already viewed are stored to give you a consistent
          experience. Some of this is kept on your device (in local storage) and
          some in our database (Google Firebase Firestore).
        </p>

        <h2 style={heading}>How we use your information</h2>
        <p style={body}>
          We use the information above only to operate the app — to remember your
          preferences, show you daily content, and keep your feed up to date. We
          do not sell your personal information.
        </p>

        <h2 style={heading}>YouTube API Services</h2>
        <p style={body}>
          The Feed displays videos using YouTube’s official embedded player and
          retrieves video information (such as titles, thumbnails, and channel
          names) through the YouTube Data API. Because of this, Morning Scroll’s
          use of information from YouTube is subject to the{" "}
          <ExternalLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</ExternalLink>.
        </p>
        <p style={body}>
          When you watch a video in the Feed, YouTube and Google may collect and
          use data in accordance with the{" "}
          <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>.
          You can review and control the data Google collects, and revoke this
          app’s access to your Google data, through the{" "}
          <ExternalLink href="https://security.google.com/settings/security/permissions">
            Google security settings
          </ExternalLink>{" "}page.
        </p>

        <h2 style={heading}>Third-party services</h2>
        <p style={body}>
          We rely on Google Firebase (Authentication, Firestore, and Storage) to
          run the app and on YouTube to provide the Feed. These services process
          data under their own terms and the{" "}
          <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>.
        </p>

        <h2 style={heading}>Data retention</h2>
        <p style={body}>
          Video information retrieved from YouTube is cached only briefly and
          refreshed regularly; it is not stored long-term. Your account data and
          preferences are kept until you ask us to delete them.
        </p>

        <h2 style={heading}>Contact</h2>
        <p style={body}>
          For any questions about this policy or to request deletion of your data,
          contact us at andrewmathewhealy@gmail.com.
        </p>
      </div>
    </div>
  );
}
