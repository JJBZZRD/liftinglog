import { Drawer } from "expo-router/drawer";

export default function DrawerLayout() {
  return (
    <Drawer>
      <Drawer.Screen
        name="index"
        options={{ drawerLabel: "Overview", title: "Overview" }}
      />
      <Drawer.Screen
        name="exercises"
        options={{ drawerLabel: "Exercises", title: "Exercises" }}
      />
      <Drawer.Screen
        name="workout-log"
        options={{ drawerLabel: "Workout Log", title: "Workout Log" }}
      />
      <Drawer.Screen
        name="programs"
        options={{ drawerLabel: "Programs", title: "Programs" }}
      />
      <Drawer.Screen
        name="settings"
        options={{ drawerLabel: "Settings", title: "Settings" }}
      />
    </Drawer>
  );
}


