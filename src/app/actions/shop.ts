"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function createShopAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const slug = slugify(rawSlug || name);

  if (name.length < 2) {
    throw new Error("Der Shopname ist zu kurz.");
  }

  if (slug.length < 3) {
    throw new Error("Der Slug muss mindestens 3 Zeichen enthalten.");
  }

  const supabase = createClient();
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || !isAdmin) {
    throw new Error("Nur Admins koennen Shops anlegen.");
  }

  const { error } = await supabase.rpc("create_shop", {
    shop_name: name,
    shop_slug: slug,
    shop_location: location
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
