import { Redirect } from "expo-router";
import { useSesjon } from "@/lib/sesjon";

/** Rotstien «/» — send til ordrelista når innlogget, ellers til innloggingen. */
export default function Index() {
  const { sesjon } = useSesjon();
  return <Redirect href={sesjon ? "/ordrer" : "/logg-inn"} />;
}
