import ProgramsComingSoon from "../../components/programs/ProgramsComingSoon";
import ProgramsScreen from "../../components/programs/ProgramsScreen";
import { appCapabilities } from "../../lib/config/releaseProfile";

export default function ProgramsRoute() {
  return appCapabilities.programsExperience === "coming-soon" ? (
    <ProgramsComingSoon />
  ) : (
    <ProgramsScreen />
  );
}
