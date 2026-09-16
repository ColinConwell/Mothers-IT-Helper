import journal from "./meta/_journal.json";
import m0000 from "./0000_init.sql";
import m0001 from "./0001_sample_call.sql";
import m0002 from "./0002_monitor.sql";
import m0003 from "./0003_call_caller.sql";
import m0004 from "./0004_call_analytics.sql";
import m0005 from "./0005_survey.sql";

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005
  }
};
