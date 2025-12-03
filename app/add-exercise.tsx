import { router } from "expo-router";
import AddExerciseModal from "../components/AddExerciseModal";

export default function AddExerciseRouteModal() {
  return (
    <AddExerciseModal
      visible
      onDismiss={() => router.back()}
      onSaved={() => {}}
    />
  );
}


