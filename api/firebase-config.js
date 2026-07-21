export default function handler(req, res) {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
    functionsRegion: process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1',
    appCheckSiteKey: process.env.FIREBASE_APP_CHECK_SITE_KEY || '',
  };
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).json({ configured, config: configured ? config : null });
}
