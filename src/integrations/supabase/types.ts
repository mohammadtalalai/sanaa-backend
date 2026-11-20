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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analysis_reports: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          language: string
          question: string
          result: Json
          sql: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          language: string
          question: string
          result: Json
          sql?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          language?: string
          question?: string
          result?: Json
          sql?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          code: string
          created_at: string
          id: number
          status: string
          title: string
        }
        Insert: {
          audience?: string
          code: string
          created_at?: string
          id?: number
          status?: string
          title: string
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          id?: number
          status?: string
          title?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          code: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: number
          order_id: number | null
          reason: string
          requested_by: string | null
          requester_name: string | null
          status: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: number
          order_id?: number | null
          reason: string
          requested_by?: string | null
          requester_name?: string | null
          status?: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: number
          order_id?: number | null
          reason?: string
          requested_by?: string | null
          requester_name?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          actor_name: string | null
          created_at: string
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          actor_name?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          action?: string
          actor?: string | null
          actor_name?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      boms: {
        Row: {
          code: string
          description: string | null
          id: number
          product_name: string
          status: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: number
          product_name: string
          status?: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          product_name?: string
          status?: string
        }
        Relationships: []
      }
      branch_expenses: {
        Row: {
          amount: number
          branch_id: number | null
          category: string
          id: number
          month_start: string
        }
        Insert: {
          amount?: number
          branch_id?: number | null
          category?: string
          id?: number
          month_start: string
        }
        Update: {
          amount?: number
          branch_id?: number | null
          category?: string
          id?: number
          month_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          branch_type: string
          city: string | null
          code: string
          created_at: string
          id: number
          name_ar: string
          name_en: string
        }
        Insert: {
          branch_type?: string
          city?: string | null
          code: string
          created_at?: string
          id?: number
          name_ar: string
          name_en: string
        }
        Update: {
          branch_type?: string
          city?: string | null
          code?: string
          created_at?: string
          id?: number
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          created_at: string
          language: string
          session_id: string
          state: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          language?: string
          session_id: string
          state: Json
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          language?: string
          session_id?: string
          state?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          city: string | null
          city_ar: string | null
          created_at: string
          created_by: string | null
          customer_type: string
          id: number
          name: string
          phone: string | null
          preferred_language: string
          source: string
        }
        Insert: {
          city?: string | null
          city_ar?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          id?: number
          name: string
          phone?: string | null
          preferred_language?: string
          source?: string
        }
        Update: {
          city?: string | null
          city_ar?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          id?: number
          name?: string
          phone?: string | null
          preferred_language?: string
          source?: string
        }
        Relationships: []
      }
      designs: {
        Row: {
          approved_at: string | null
          created_at: string
          design_id: string
          dimension_check: Json
          feedback: string | null
          files: Json
          quotation_no: string
          session_id: string | null
          spec: Json
          status: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          design_id: string
          dimension_check: Json
          feedback?: string | null
          files: Json
          quotation_no: string
          session_id?: string | null
          spec: Json
          status?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          design_id?: string
          dimension_check?: Json
          feedback?: string | null
          files?: Json
          quotation_no?: string
          session_id?: string | null
          spec?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "designs_quotation_no_fkey"
            columns: ["quotation_no"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["quotation_no"]
          },
          {
            foreignKeyName: "designs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      factory_settings: {
        Row: {
          branch_label_ar: string
          branch_label_en: string
          employee_discount_limit: number
          factory_name_ar: string
          factory_name_en: string
          id: number
          phone: string | null
          support_status: string
          support_until: string | null
          tax_pct: number
          updated_at: string
        }
        Insert: {
          branch_label_ar?: string
          branch_label_en?: string
          employee_discount_limit?: number
          factory_name_ar?: string
          factory_name_en?: string
          id?: number
          phone?: string | null
          support_status?: string
          support_until?: string | null
          tax_pct?: number
          updated_at?: string
        }
        Update: {
          branch_label_ar?: string
          branch_label_en?: string
          employee_discount_limit?: number
          factory_name_ar?: string
          factory_name_en?: string
          id?: number
          phone?: string | null
          support_status?: string
          support_until?: string | null
          tax_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          name: string
          sort: number
        }
        Insert: {
          enabled?: boolean
          key: string
          name: string
          sort?: number
        }
        Update: {
          enabled?: boolean
          key?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: number
          ip: string
        }
        Insert: {
          attempted_at?: string
          id?: number
          ip: string
        }
        Update: {
          attempted_at?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: number
          material_type: string
          name_ar: string
          name_en: string
          reorder_level: number
          sku: string
          stock_qty: number
          supplier_id: number | null
          unit: string
          unit_cost: number
          warehouse_ar: string | null
          warehouse_en: string | null
        }
        Insert: {
          id?: number
          material_type: string
          name_ar: string
          name_en: string
          reorder_level?: number
          sku: string
          stock_qty?: number
          supplier_id?: number | null
          unit: string
          unit_cost?: number
          warehouse_ar?: string | null
          warehouse_en?: string | null
        }
        Update: {
          id?: number
          material_type?: string
          name_ar?: string
          name_en?: string
          reorder_level?: number
          sku?: string
          stock_qty?: number
          supplier_id?: number | null
          unit?: string
          unit_cost?: number
          warehouse_ar?: string | null
          warehouse_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          created_at: string
          id: number
          language: string
          markdown: string | null
          period: string
          report: Json
        }
        Insert: {
          created_at?: string
          id?: number
          language: string
          markdown?: string | null
          period: string
          report: Json
        }
        Update: {
          created_at?: string
          id?: number
          language?: string
          markdown?: string | null
          period?: string
          report?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: number
          link: string
          read: boolean
          title_ar: string
          title_en: string
        }
        Insert: {
          created_at?: string
          id?: number
          link?: string
          read?: boolean
          title_ar: string
          title_en: string
        }
        Update: {
          created_at?: string
          id?: number
          link?: string
          read?: boolean
          title_ar?: string
          title_en?: string
        }
        Relationships: []
      }
      order_lines: {
        Row: {
          description: string | null
          id: number
          line_total: number
          order_id: number
          product_id: number
          quantity: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          description?: string | null
          id?: number
          line_total?: number
          order_id: number
          product_id: number
          quantity?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          description?: string | null
          id?: number
          line_total?: number
          order_id?: number
          product_id?: number
          quantity?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: number | null
          cancel_reason: string | null
          channel: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: number | null
          customer_tax_id: string | null
          delivered_at: string | null
          delivery_city: string | null
          design: Json | null
          discount_amount: number
          id: number
          invoice_confirmed_at: string | null
          order_no: string
          order_type: string
          product_summary: string | null
          product_summary_en: string | null
          promised_date: string | null
          sales_rep_id: number | null
          source_quotation_no: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_pct: number
        }
        Insert: {
          branch_id?: number | null
          cancel_reason?: string | null
          channel?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: number | null
          customer_tax_id?: string | null
          delivered_at?: string | null
          delivery_city?: string | null
          design?: Json | null
          discount_amount?: number
          id?: number
          invoice_confirmed_at?: string | null
          order_no: string
          order_type?: string
          product_summary?: string | null
          product_summary_en?: string | null
          promised_date?: string | null
          sales_rep_id?: number | null
          source_quotation_no?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_pct?: number
        }
        Update: {
          branch_id?: number | null
          cancel_reason?: string | null
          channel?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: number | null
          customer_tax_id?: string | null
          delivered_at?: string | null
          delivery_city?: string | null
          design?: Json | null
          discount_amount?: number
          id?: number
          invoice_confirmed_at?: string | null
          order_no?: string
          order_type?: string
          product_summary?: string | null
          product_summary_en?: string | null
          promised_date?: string | null
          sales_rep_id?: number | null
          source_quotation_no?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          id: number
          method: string
          order_id: number
          paid_at: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          id?: number
          method?: string
          order_id: number
          paid_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          id?: number
          method?: string
          order_id?: number
          paid_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          limits: string
          name: string
          price: string
        }
        Insert: {
          code: string
          limits: string
          name: string
          price: string
        }
        Update: {
          code?: string
          limits?: string
          name?: string
          price?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          code: string
          name_ar: string
          name_en: string
        }
        Insert: {
          code: string
          name_ar: string
          name_en: string
        }
        Update: {
          code?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      production_orders: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          completed_steps: number
          current_stage_en: string | null
          id: number
          labor_cost: number
          material_cost: number
          order_id: number | null
          planned_end: string | null
          planned_start: string | null
          po_no: string
          product_id: number | null
          quantity: number
          standard_cost: number
          status: string
          total_steps: number
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          completed_steps?: number
          current_stage_en?: string | null
          id?: number
          labor_cost?: number
          material_cost?: number
          order_id?: number | null
          planned_end?: string | null
          planned_start?: string | null
          po_no: string
          product_id?: number | null
          quantity?: number
          standard_cost?: number
          status?: string
          total_steps?: number
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          completed_steps?: number
          current_stage_en?: string | null
          id?: number
          labor_cost?: number
          material_cost?: number
          order_id?: number | null
          planned_end?: string | null
          planned_start?: string | null
          po_no?: string
          product_id?: number | null
          quantity?: number
          standard_cost?: number
          status?: string
          total_steps?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          catalog_type: string | null
          category_code: string | null
          depth_cm: number | null
          finish_ar: string | null
          finish_en: string | null
          height_cm: number | null
          id: number
          list_price: number
          name_ar: string
          name_en: string
          sku: string
          unit_cost: number
          width_cm: number | null
          wood_ar: string | null
          wood_en: string | null
        }
        Insert: {
          active?: boolean
          catalog_type?: string | null
          category_code?: string | null
          depth_cm?: number | null
          finish_ar?: string | null
          finish_en?: string | null
          height_cm?: number | null
          id?: number
          list_price?: number
          name_ar: string
          name_en: string
          sku: string
          unit_cost?: number
          width_cm?: number | null
          wood_ar?: string | null
          wood_en?: string | null
        }
        Update: {
          active?: boolean
          catalog_type?: string | null
          category_code?: string | null
          depth_cm?: number | null
          finish_ar?: string | null
          finish_en?: string | null
          height_cm?: number | null
          id?: number
          list_price?: number
          name_ar?: string
          name_en?: string
          sku?: string
          unit_cost?: number
          width_cm?: number | null
          wood_ar?: string | null
          wood_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          expected_at: string | null
          id: number
          ordered_at: string
          received_at: string | null
          supplier_id: number | null
          total: number
        }
        Insert: {
          expected_at?: string | null
          id?: number
          ordered_at: string
          received_at?: string | null
          supplier_id?: number | null
          total?: number
        }
        Update: {
          expected_at?: string | null
          id?: number
          ordered_at?: string
          received_at?: string | null
          supplier_id?: number | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_checks: {
        Row: {
          check_name: string
          code: string
          id: number
          order_id: number | null
          status: string
        }
        Insert: {
          check_name: string
          code: string
          id?: number
          order_id?: number | null
          status?: string
        }
        Update: {
          check_name?: string
          code?: string
          id?: number
          order_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          accepted_at: string | null
          created_at: string
          currency: string
          customer_name: string | null
          customer_phone: string | null
          design_id: string | null
          item: Json
          language: string
          pricing: Json
          quotation_no: string
          session_id: string | null
          status: string
          total: number
          valid_until: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          currency?: string
          customer_name?: string | null
          customer_phone?: string | null
          design_id?: string | null
          item: Json
          language?: string
          pricing: Json
          quotation_no: string
          session_id?: string | null
          status?: string
          total: number
          valid_until: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          currency?: string
          customer_name?: string | null
          customer_phone?: string | null
          design_id?: string | null
          item?: Json
          language?: string
          pricing?: Json
          quotation_no?: string
          session_id?: string | null
          status?: string
          total?: number
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          branch_id: number | null
          id: number
          name_ar: string
          name_en: string
        }
        Insert: {
          branch_id?: number | null
          id?: number
          name_ar: string
          name_en: string
        }
        Update: {
          branch_id?: number | null
          id?: number
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          cash_received: number
          closed_at: string | null
          counted_cash: number | null
          employee: string
          id: number
          opened_at: string
          opening_cash: number
        }
        Insert: {
          cash_received?: number
          closed_at?: string | null
          counted_cash?: number | null
          employee: string
          id?: number
          opened_at?: string
          opening_cash?: number
        }
        Update: {
          cash_received?: number
          closed_at?: string | null
          counted_cash?: number | null
          employee?: string
          id?: number
          opened_at?: string
          opening_cash?: number
        }
        Relationships: []
      }
      shipments: {
        Row: {
          cost: number
          delivered_at: string | null
          id: number
          order_id: number | null
          shipped_at: string | null
        }
        Insert: {
          cost?: number
          delivered_at?: string | null
          id?: number
          order_id?: number | null
          shipped_at?: string | null
        }
        Update: {
          cost?: number
          delivered_at?: string | null
          id?: number
          order_id?: number | null
          shipped_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: number
          lead_time_days: number
          name_ar: string
          name_en: string
          phone: string | null
        }
        Insert: {
          id?: number
          lead_time_days?: number
          name_ar: string
          name_en: string
          phone?: string | null
        }
        Update: {
          id?: number
          lead_time_days?: number
          name_ar?: string
          name_en?: string
          phone?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          branches_count: number
          created_at: string
          id: number
          manager_email: string | null
          name: string
          plan: string
          status: string
          users_count: number
        }
        Insert: {
          branches_count?: number
          created_at?: string
          id?: number
          manager_email?: string | null
          name: string
          plan?: string
          status?: string
          users_count?: number
        }
        Update: {
          branches_count?: number
          created_at?: string
          id?: number
          manager_email?: string | null
          name?: string
          plan?: string
          status?: string
          users_count?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analytics_views_info: { Args: never; Returns: Json }
      customer_orders: { Args: { p_customer_id: number }; Returns: Json }
      dashboard_summary: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      order_production: { Args: { p_order_no: string }; Returns: Json }
      run_analytics_sql: {
        Args: { p_max_rows?: number; p_sql: string }
        Returns: Json
      }
      track_order: {
        Args: { p_customer_id: number; p_order_no: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "manager", "employee"],
    },
  },
} as const
