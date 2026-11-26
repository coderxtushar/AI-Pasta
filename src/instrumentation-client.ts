// Browser error tracking, only when NEXT_PUBLIC_SENTRY_DSN is set. Sentry is
// loaded lazily so the app doesn't ship its SDK to users when it's disabled.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Promise.all([import("@sentry/nextjs"), import("./app/library/sentryScrub")]).then(([Sentry, { scrubEvent }]) => {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
      beforeSend: scrubEvent,
    });
  });
}
