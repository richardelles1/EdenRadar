export async function runAlertDispatch(): Promise<void> {
  const { checkAndSendAlerts } = await import("./alertMailer.js");
  return checkAndSendAlerts();
}
