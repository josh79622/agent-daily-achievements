// Which report day the schedule should generate right now. Decision:
// docs/decisions/2026-09-21-seven-am-report-window.md ("the run happens at
// 07:00 on D+1 and produces the report for D"; "a wake after several missed
// days generates only the most recent completed window").

export {
  currentOpenWindow,
  mostRecentFinishedWindow,
  nextCalendarDate,
  previousCalendarDate,
  reportDateFor,
} from "../report/date-window.js";
