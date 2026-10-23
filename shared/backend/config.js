/* Public connection settings shared by the web app and React Native. */
(function (root) {
  const config = Object.freeze({
    url: "https://zddlukukrjdeoeofocud.supabase.co",
    publishableKey: "sb_publishable_22Z9BZSp10yJKSEEtrXJkw_RcWdVySZ"
  });
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.KIDSSYNC_SUPABASE = config;
})(globalThis);
