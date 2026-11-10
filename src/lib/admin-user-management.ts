import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeUgandanPhone } from "@/lib/phone";

async function requireAdmin() {
  const authorization = getRequest().headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error("Unauthorized");
  }

  const { data: adminRole, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) throw roleError;
  if (!adminRole) throw new Error("Forbidden: administrator access required");
}

export type AdminCreateUserInput = {
  full_name: string;
  email: string;
  phone: string;
  pin: string;
  role: "admin" | "treasurer" | "committee" | "member";
  member_id?: string | null;
};

export type AdminSetUserPasswordInput = {
  user_id: string;
  pin: string;
};

export type MigrateSaccoAccountInput = {
  phone: string;
  pin: string;
};

export type AdminUpdateUserInput = {
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
};

export type AdminDeleteUserInput = {
  user_id: string;
};

export const setSaccoUserPassword = createServerFn({ method: "POST" })
  .validator((input: AdminSetUserPasswordInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.user_id) {
      throw new Error("User is required");
    }

    if (!/^\d{6}$/.test(data.pin)) {
      throw new Error("PIN must be exactly 6 digits");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.pin,
    });

    if (error) throw error;

    return { success: true };
  });

export const migrateSaccoAccountToPhonePin = createServerFn({ method: "POST" })
  .validator((input: MigrateSaccoAccountInput) => input)
  .handler(async ({ data }) => {
    const authorization = getRequest().headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      throw new Error("Sign in to your existing account first");

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authorization.slice("Bearer ".length),
    );
    if (userError || !userData.user) throw new Error("Your current account session is invalid");

    if (!/^\+256[0-9]{9}$/.test(data.phone)) {
      throw new Error("Enter a Ugandan phone number in +256XXXXXXXXX format");
    }
    if (!/^\d{6}$/.test(data.pin)) throw new Error("PIN must be exactly 6 digits");

    const [
      { data: profile, error: profileLookupError },
      { data: member, error: memberLookupError },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("phone").eq("id", userData.user.id).maybeSingle(),
      supabaseAdmin
        .from("members")
        .select("id, phone")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
    ]);
    if (profileLookupError) throw profileLookupError;
    if (memberLookupError) throw memberLookupError;
    const storedPhones = [profile?.phone, member?.phone].map((storedPhone) =>
      storedPhone ? normalizeUgandanPhone(storedPhone) : null,
    );
    if (!storedPhones.includes(data.phone)) {
      throw new Error(
        "The phone must match the number already recorded for your membership. Contact the SACCO office to update it.",
      );
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
      phone: data.phone,
      phone_confirm: true,
      password: data.pin,
    });
    if (authError) throw authError;

    const [{ error: profileError }, { error: memberError }] = await Promise.all([
      supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", userData.user.id),
      supabaseAdmin.from("members").update({ phone: data.phone }).eq("user_id", userData.user.id),
    ]);
    if (profileError) throw profileError;
    if (memberError) throw memberError;

    return { success: true, user_id: userData.user.id };
  });

export const updateSaccoUser = createServerFn({ method: "POST" })
  .validator((input: AdminUpdateUserInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.user_id) {
      throw new Error("User is required");
    }

    const fullName = data.full_name?.trim() ?? "";
    const email = data.email?.trim() ?? "";
    const phone = data.phone?.trim() ?? "";

    if (!fullName) {
      throw new Error("Full name is required");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }

    const authUpdate: {
      email?: string;
      phone?: string;
      phone_confirm?: boolean;
      user_metadata?: { full_name: string };
    } = {
      user_metadata: { full_name: fullName },
    };

    if (email) authUpdate.email = email;
    if (phone) {
      authUpdate.phone = phone;
      authUpdate.phone_confirm = true;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      authUpdate,
    );
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        email: email || null,
        phone: phone || null,
      })
      .eq("id", data.user_id);

    if (profileError) throw profileError;

    return { success: true };
  });

export const deleteSaccoUser = createServerFn({ method: "POST" })
  .validator((input: AdminDeleteUserInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.user_id) {
      throw new Error("User is required");
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id);
    if (roleError) throw roleError;

    const { error: memberError } = await supabaseAdmin
      .from("members")
      .update({ user_id: null })
      .eq("user_id", data.user_id);
    if (memberError) throw memberError;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", data.user_id);
    if (profileError) throw profileError;

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (deleteError) throw deleteError;

    return { success: true };
  });

export const createSaccoUser = createServerFn({ method: "POST" })
  .validator((input: AdminCreateUserInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    const fullName = data.full_name.trim();
    const email = data.email.trim();
    const phone = data.phone.trim();

    if (!fullName) {
      throw new Error("Full name is required");
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }

    if (!/^\+256[0-9]{9}$/.test(phone)) {
      throw new Error("Enter a Ugandan phone number in +256XXXXXXXXX format");
    }

    if (!/^\d{6}$/.test(data.pin)) {
      throw new Error("PIN must be exactly 6 digits");
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
      phone,
      password: data.pin,
      phone_confirm: true,
      user_metadata: { full_name: fullName, contact_email: email },
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
        phone,
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
