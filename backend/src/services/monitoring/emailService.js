const config = require('../../config');

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    return { sent: false, reason: 'no_recipient' };
  }

  if (isSmtpConfigured()) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || '',
          }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });

    return { sent: true, mode: 'smtp' };
  }

  console.log('[monitoring-alert:email]');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(text);
  return { sent: true, mode: 'console' };
}

function flowDetailUrl(flowId, runId = null) {
  const base = config.appBaseUrl.replace(/\/$/, '');
  if (runId) {
    return `${base}/monitoring/flows/${flowId}?runId=${runId}`;
  }
  return `${base}/monitoring/flows/${flowId}`;
}

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  try {
    return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function businessImpactFromRun(run) {
  const summary = run?.result?.summary;
  if (summary) return summary;
  const critical = (run?.result?.issues || []).find((issue) => issue.severity === 'critical');
  if (critical?.message) return critical.message;
  return null;
}

async function sendFailureAlertEmail({ flow, project, run }) {
  const subject = `Flow failed: ${flow.name}`;
  const impact = businessImpactFromRun(run);
  const lines = [
    `Domain: ${project?.domain || 'Unknown'}`,
    `Flow: ${flow.name}`,
    `Failure reason: ${run.failureReason || run.result?.summary || 'Unknown failure'}`,
    `Last run time: ${formatTimestamp(run.finishedAt || run.startedAt)}`,
    `Run detail: ${flowDetailUrl(flow.id, run.id)}`,
  ];
  if (impact) {
    lines.push(`Business impact: ${impact}`);
  }

  return sendEmail({
    to: flow.alertEmail,
    subject,
    text: lines.join('\n'),
  });
}

async function sendRecoveryAlertEmail({ flow, project, run }) {
  const subject = `Flow recovered: ${flow.name}`;
  const lines = [
    `Domain: ${project?.domain || 'Unknown'}`,
    `Flow: ${flow.name}`,
    `Recovered at: ${formatTimestamp(run.finishedAt || run.startedAt)}`,
    `Monitoring detail: ${flowDetailUrl(flow.id)}`,
  ];

  return sendEmail({
    to: flow.alertEmail,
    subject,
    text: lines.join('\n'),
  });
}

module.exports = {
  sendEmail,
  sendFailureAlertEmail,
  sendRecoveryAlertEmail,
  isSmtpConfigured,
};
