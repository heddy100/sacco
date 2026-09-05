import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminCreateUserInput = {
  full_name: string;
  email: string;
  password: string;
  role: "admin" | "treasurer" | "committee" | "member";
  member_id?: string | null;
};

export type AdminResetPasswordInput = {
  email: string;
};

export type AdminSetUserPasswordInput = {
  user_id: string;
  password: string;
};

export const resetSaccoUserPassword = createServerFn({ method: "POST" })
  .validator((input: AdminResetPasswordInput) => input)
  .handler(async ({ data }) => {
    const email = data.email.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5174"}/reset-password`,
    });

    if (error) throw error;

    return { success: true };
  });

export const setSaccoUserPassword = createServerFn({ method: "POST" })
  .validator((input: AdminSetUserPasswordInput) => input)
  .handler(async ({ data }) => {
    const password = data.password;

    if (!data.user_id) {
      throw new Error("User is required");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error("Password must include uppercase, lowercase and a number");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password,
    });

    if (error) throw error;

    return { success: true };
  });

export const createSaccoUser = createServerFn({ method: "POST" })
  .validator((input: AdminCreateUserInput) => input)
  .handler(async ({ data }) => {
    const fullName = data.full_name.trim();
    const email = data.email.trim();
    const password = data.password;

    if (!fullName) {
      throw new Error("Full name is required");
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error("Password must include uppercase, lowercase and a number");
    }

    if (data.member_id) {
      const { data: existingMember, error: memberLookupError } = await supabaseAdmin
        .from("members")
        .select("user_id")
        .eq("id", data.member_id)
        .maybeSingle();

      if (memberLookupError) throw memberLookupError;
      if (existingMember?.user_id) {
        throw new Error("That member is already linked to another account");
      }
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) throw createError;
    if (!createdUser.user) {
      throw new Error("The account could not be created");
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: createdUser.user.id,
        full_name: fullName,
        email,
      },
      { onConflict: "id" },
    );

    if (profileError) throw profileError;

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: createdUser.user.id, role: data.role }, { onConflict: "user_id,role" });

    if (roleError) throw roleError;

    if (data.member_id) {
      const { error: linkError } = await supabaseAdmin
        .from("members")
        .update({ user_id: createdUser.user.id })
        .eq("id", data.member_id);

      if (linkError) throw linkError;
    }

    return {
      id: createdUser.user.id,
      email: createdUser.user.email,
      full_name: fullName,
    };
  });
