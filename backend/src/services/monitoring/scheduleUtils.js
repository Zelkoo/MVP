const SCHEDULES = ['manual', 'daily', 'weekly', 'every-6-hours'];

function isValidSchedule(value) {
  return SCHEDULES.includes(value);
}

function computeNextRunAt(schedule, fromDate = new Date()) {
  if (!schedule || schedule === 'manual') {
    return null;
  }

  const next = new Date(fromDate);

  switch (schedule) {
    case 'every-6-hours':
      next.setHours(next.getHours() + 6);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    default:
      return null;
  }

  return next.toISOString();
}

function scheduleLabel(schedule) {
  switch (schedule) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'every-6-hours':
      return 'Every 6 hours';
    default:
      return 'Manual only';
  }
}

module.exports = {
  SCHEDULES,
  isValidSchedule,
  computeNextRunAt,
  scheduleLabel,
};
