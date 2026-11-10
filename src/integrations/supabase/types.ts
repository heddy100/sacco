export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      loan_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          interest_rate: number
          max_amount: number
          max_period_months: number
          name: string
          penalty_rate: number
          processing_fee_pct: number
          savings_multiplier: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          interest_rate?: number
          max_amount?: number
          max_period_months?: number
          name: string
          penalty_rate?: number
          processing_fee_pct?: number
          savings_multiplier?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          interest_rate?: number
          max_amount?: number
          max_period_months?: number
          name?: string
          penalty_rate?: number
          processing_fee_pct?: number
          savings_multiplier?: number
        }
        Relationships: []
      }
      loan_repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          interest: number
          loan_id: string
          member_id: string
          method: Database["public"]["Enums"]["payment_method"]
          penalty: number
          principal: number
          recorded_by: string | null
          reference: string | null
          txn_date: string
          txn_no: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          interest?: number
          loan_id: string
          member_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          penalty?: number
          principal?: number
          recorded_by?: string | null
          reference?: string | null
          txn_date?: string
          txn_no?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          interest?: number
          loan_id?: string
          member_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          penalty?: number
          principal?: number
          recorded_by?: string | null
          reference?: string | null
          txn_date?: string
          txn_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "loan_repayments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount_approved: number | null
          amount_requested: number
          applied_at: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          disbursed_at: string | null
          guarantor1_contact: string | null
          guarantor1_member_id: string | null
          guarantor1_name: string | null
          guarantor2_contact: string | null
          guarantor2_member_id: string | null
          guarantor2_name: string | null
          id: string
          interest_rate: number
          loan_no: string
          member_id: string
          period_months: number
          product_id: string | null
          purpose: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["loan_status"]
        }
        Insert: {
          amount_approved?: number | null
          amount_requested: number
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          guarantor1_contact?: string | null
          guarantor1_member_id?: string | null
          guarantor1_name?: string | null
          guarantor2_contact?: string | null
          guarantor2_member_id?: string | null
          guarantor2_name?: string | null
          id?: string
          interest_rate?: number
          loan_no?: string
          member_id: string
          period_months?: number
          product_id?: string | null
          purpose?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
        }
        Update: {
          amount_approved?: number | null
          amount_requested?: number
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          guarantor1_contact?: string | null
          guarantor1_member_id?: string | null
          guarantor1_name?: string | null
          guarantor2_contact?: string | null
          guarantor2_member_id?: string | null
          guarantor2_name?: string | null
          id?: string
          interest_rate?: number
          loan_no?: string
          member_id?: string
          period_months?: number
          product_id?: string | null
          purpose?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "loans_guarantor1_member_id_fkey"
            columns: ["guarantor1_member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "loans_guarantor1_member_id_fkey"
            columns: ["guarantor1_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_guarantor2_member_id_fkey"
            columns: ["guarantor2_member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "loans_guarantor2_member_id_fkey"
            columns: ["guarantor2_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          join_date: string
          member_no: string
          national_id: string | null
          next_of_kin: string | null
          next_of_kin_phone: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          staff_no: string | null
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          join_date?: string
          member_no: string
          national_id?: string | null
          next_of_kin?: string | null
          next_of_kin_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          staff_no?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          join_date?: string
          member_no?: string
          national_id?: string | null
          next_of_kin?: string | null
          next_of_kin_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          staff_no?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_member_plans: {
        Row: {
          id: string
          member_id: string
          plan_month: string
          savings_amount: number
          shares_count: number
          submitted_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          plan_month: string
          savings_amount?: number
          shares_count?: number
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          plan_month?: string
          savings_amount?: number
          shares_count?: number
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_member_plans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      savings_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          member_id: string
          method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string | null
          reference: string | null
          txn_date: string
          txn_no: string
          txn_type: Database["public"]["Enums"]["savings_type"]
          verified: boolean
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          member_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference?: string | null
          txn_date?: string
          txn_no?: string
          txn_type: Database["public"]["Enums"]["savings_type"]
          verified?: boolean
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          member_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference?: string | null
          txn_date?: string
          txn_no?: string
          txn_type?: Database["public"]["Enums"]["savings_type"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "savings_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "savings_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      share_transactions: {
        Row: {
          created_at: string
          id: string
          member_id: string
          method: Database["public"]["Enums"]["payment_method"]
          price_per_share: number
          recorded_by: string | null
          reference: string | null
          shares: number
          txn_date: string
          txn_no: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          price_per_share?: number
          recorded_by?: string | null
          reference?: string | null
          shares: number
          txn_date?: string
          txn_no?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          price_per_share?: number
          recorded_by?: string | null
          reference?: string | null
          shares?: number
          txn_date?: string
          txn_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "share_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          id: string
          member_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          ref_no: string
          source_id: string | null
          source_table: string | null
          txn_date: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          ref_no?: string
          source_id?: string | null
          source_table?: string | null
          txn_date?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          ref_no?: string
          source_id?: string | null
          source_table?: string | null
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_balances: {
        Row: {
          department_id: string | null
          full_name: string | null
          loan_balance: number | null
          member_id: string | null
          member_no: string | null
          savings_balance: number | null
          shares_owned: number | null
          shares_value: number | null
          status: Database["public"]["Enums"]["member_status"] | null
          total_borrowed: number | null
          total_deposits: number | null
          total_repaid: number | null
          total_withdrawals: number | null
        }
        Relationships: [
          {
            foreignKeyName: "members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_post: { Args: { _user_id: string }; Returns: boolean }
      current_member_id: { Args: never; Returns: string }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "treasurer" | "committee" | "member"
      loan_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
        | "disbursed"
        | "completed"
      member_status: "active" | "inactive" | "suspended" | "exited"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "mobile_money"
        | "salary_deduction"
        | "cheque"
        | "other"
      savings_type: "deposit" | "withdrawal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "treasurer", "committee", "member"],
      loan_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "disbursed",
        "completed",
      ],
      member_status: ["active", "inactive", "suspended", "exited"],
      payment_method: [
        "cash",
        "bank_transfer",
        "mobile_money",
        "salary_deduction",
        "cheque",
        "other",
      ],
      savings_type: ["deposit", "withdrawal"],
    },
  },
} as const
