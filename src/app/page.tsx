import { redirect } from "next/navigation";

export default function HomePage({
  searchParams
}: {
  searchParams?: {
    code?: string;
    next?: string;
    [key: string]: string | string[] | undefined;
  };
}) {
  if (searchParams?.code) {
    const params = new URLSearchParams();
    params.set("code", searchParams.code);

    if (typeof searchParams.next === "string") {
      params.set("next", searchParams.next);
    }

    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect("/dashboard");
}
