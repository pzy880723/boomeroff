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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_permissions: {
        Row: {
          description: string | null
          group: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          group?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          group?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      app_role_permissions: {
        Row: {
          permission_key: string
          role_code: string
        }
        Insert: {
          permission_key: string
          role_code: string
        }
        Update: {
          permission_key?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "app_role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["code"]
          },
        ]
      }
      app_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_system: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_system?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_system?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          appreciation: string | null
          buy_reason: string | null
          care_tips: string | null
          category: Database["public"]["Enums"]["product_category"]
          collection_value: string | null
          comments_count: number
          condition: string | null
          confidence: number | null
          craft: string | null
          created_at: string
          description: string | null
          dimensions: string | null
          era: string | null
          guest_name: string | null
          id: string
          image_url: string | null
          is_guest: boolean
          is_public: boolean
          likes_count: number
          market_value: string | null
          material: string | null
          name: string
          origin: string | null
          product_id: string | null
          rarity: number | null
          selling_points: Json
          story: string | null
          tips: string | null
          user_id: string | null
        }
        Insert: {
          appreciation?: string | null
          buy_reason?: string | null
          care_tips?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          collection_value?: string | null
          comments_count?: number
          condition?: string | null
          confidence?: number | null
          craft?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          era?: string | null
          guest_name?: string | null
          id?: string
          image_url?: string | null
          is_guest?: boolean
          is_public?: boolean
          likes_count?: number
          market_value?: string | null
          material?: string | null
          name: string
          origin?: string | null
          product_id?: string | null
          rarity?: number | null
          selling_points?: Json
          story?: string | null
          tips?: string | null
          user_id?: string | null
        }
        Update: {
          appreciation?: string | null
          buy_reason?: string | null
          care_tips?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          collection_value?: string | null
          comments_count?: number
          condition?: string | null
          confidence?: number | null
          craft?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          era?: string | null
          guest_name?: string | null
          id?: string
          image_url?: string | null
          is_guest?: boolean
          is_public?: boolean
          likes_count?: number
          market_value?: string | null
          material?: string | null
          name?: string
          origin?: string | null
          product_id?: string | null
          rarity?: number | null
          selling_points?: Json
          story?: string | null
          tips?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      current_session: {
        Row: {
          id: string
          is_active: boolean
          operator_id: string | null
          product_id: string | null
          started_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          operator_id?: string | null
          product_id?: string | null
          started_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_active?: boolean
          operator_id?: string | null
          product_id?: string | null
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_session_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_knowledge: {
        Row: {
          content: Json
          created_at: string
          date: string
          id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          date: string
          id?: string
        }
        Update: {
          content?: Json
          created_at?: string
          date?: string
          id?: string
        }
        Relationships: []
      }
      guest_daily_usage: {
        Row: {
          id: string
          ip_hash: string
          recognize_count: number
          share_count: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          id?: string
          ip_hash: string
          recognize_count?: number
          share_count?: number
          updated_at?: string
          usage_date?: string
        }
        Update: {
          id?: string
          ip_hash?: string
          recognize_count?: number
          share_count?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      knowledge_test_results: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_kind: string
          last_attempt_at: string
          passed_at: string | null
          score: number
          source_id: string | null
          source_type: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_kind: string
          last_attempt_at?: string
          passed_at?: string | null
          score?: number
          source_id?: string | null
          source_type?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_kind?: string
          last_attempt_at?: string
          passed_at?: string | null
          score?: number
          source_id?: string | null
          source_type?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      official_knowledge: {
        Row: {
          backstamp_url: string | null
          body: string | null
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          content: Json
          cover_url: string | null
          created_at: string
          created_by: string | null
          era: string | null
          favorite_count: number
          gallery: Json
          id: string
          importance_score: number
          ip_name: string | null
          name: string
          origin: string | null
          selling_points: Json
          source_product_id: string | null
          sub_type: string | null
          summary: string | null
          tips: string | null
          updated_at: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          backstamp_url?: string | null
          body?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          content?: Json
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          era?: string | null
          favorite_count?: number
          gallery?: Json
          id?: string
          importance_score?: number
          ip_name?: string | null
          name: string
          origin?: string | null
          selling_points?: Json
          source_product_id?: string | null
          sub_type?: string | null
          summary?: string | null
          tips?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          backstamp_url?: string | null
          body?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          content?: Json
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          era?: string | null
          favorite_count?: number
          gallery?: Json
          id?: string
          importance_score?: number
          ip_name?: string | null
          name?: string
          origin?: string | null
          selling_points?: Json
          source_product_id?: string | null
          sub_type?: string | null
          summary?: string | null
          tips?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: []
      }
      price_records: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          price: number
          price_type: string
          product_id: string
          recorded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          price: number
          price_type: string
          product_id: string
          recorded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          price?: number
          price_type?: string
          product_id?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge: {
        Row: {
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          content: Json
          created_at: string
          created_by: string | null
          era: string | null
          id: string
          image_url: string | null
          is_official: boolean
          origin: string | null
          product_id: string | null
          product_name: string
          selling_points: Json
          sub_type: string | null
          tips: string | null
        }
        Insert: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          content?: Json
          created_at?: string
          created_by?: string | null
          era?: string | null
          id?: string
          image_url?: string | null
          is_official?: boolean
          origin?: string | null
          product_id?: string | null
          product_name: string
          selling_points?: Json
          sub_type?: string | null
          tips?: string | null
        }
        Update: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          content?: Json
          created_at?: string
          created_by?: string | null
          era?: string | null
          id?: string
          image_url?: string | null
          is_official?: boolean
          origin?: string | null
          product_id?: string | null
          product_name?: string
          selling_points?: Json
          sub_type?: string | null
          tips?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_knowledge_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ai_analysis: Json | null
          category: Database["public"]["Enums"]["product_category"]
          condition: string | null
          craft: string | null
          created_at: string
          created_by: string | null
          description: string | null
          dimensions: string | null
          era: string | null
          id: string
          image_hash: string | null
          image_url: string | null
          material: string | null
          name: string
          origin: string | null
          scripts: Json | null
          selling_points: Json | null
          tips: string | null
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          category?: Database["public"]["Enums"]["product_category"]
          condition?: string | null
          craft?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimensions?: string | null
          era?: string | null
          id?: string
          image_hash?: string | null
          image_url?: string | null
          material?: string | null
          name: string
          origin?: string | null
          scripts?: Json | null
          selling_points?: Json | null
          tips?: string | null
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          category?: Database["public"]["Enums"]["product_category"]
          condition?: string | null
          craft?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimensions?: string | null
          era?: string | null
          id?: string
          image_hash?: string | null
          image_url?: string | null
          material?: string | null
          name?: string
          origin?: string | null
          scripts?: Json | null
          selling_points?: Json | null
          tips?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shift_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          shift_code: string
          shop_id: string | null
          source: string
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          shift_code: string
          shop_id?: string | null
          source?: string
          user_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          shift_code?: string
          shop_id?: string | null
          source?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_schedules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_holidays: {
        Row: {
          created_at: string
          date: string
          full_staff_off: boolean
          id: string
          intern_works: boolean
          name: string
          shop_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          full_staff_off?: boolean
          id?: string
          intern_works?: boolean
          name: string
          shop_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          full_staff_off?: boolean
          id?: string
          intern_works?: boolean
          name?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_holidays_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_kb_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          shop_id: string | null
          sort_order: number
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          shop_id?: string | null
          sort_order?: number
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          shop_id?: string | null
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_kb_categories_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_kb_entries: {
        Row: {
          body: string
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          shop_id: string | null
          sort_order: number
          tags: string[]
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          shop_id?: string | null
          sort_order?: number
          tags?: string[]
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          shop_id?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_kb_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shop_kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_kb_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_shifts: {
        Row: {
          active: boolean
          code: string
          color: string | null
          created_at: string
          end_time: string
          id: string
          name: string
          shop_id: string | null
          sort_order: number
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          color?: string | null
          created_at?: string
          end_time: string
          id?: string
          name: string
          shop_id?: string | null
          sort_order?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          color?: string | null
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          shop_id?: string | null
          sort_order?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_shifts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff_day_offs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          off_date: string
          reason: string | null
          shop_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          off_date: string
          reason?: string | null
          shop_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          off_date?: string
          reason?: string | null
          shop_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          allowed_shop_ids: string[]
          available_weekdays: number[]
          blocked_shifts: string[]
          blocked_weekdays: number[]
          employment_type: string
          max_per_week: number
          note: string | null
          position: string | null
          preferred_shifts: string[]
          real_name: string | null
          shop_id: string | null
          updated_at: string
          user_id: string
          weekly_workdays: number
        }
        Insert: {
          allowed_shop_ids?: string[]
          available_weekdays?: number[]
          blocked_shifts?: string[]
          blocked_weekdays?: number[]
          employment_type?: string
          max_per_week?: number
          note?: string | null
          position?: string | null
          preferred_shifts?: string[]
          real_name?: string | null
          shop_id?: string | null
          updated_at?: string
          user_id: string
          weekly_workdays?: number
        }
        Update: {
          allowed_shop_ids?: string[]
          available_weekdays?: number[]
          blocked_shifts?: string[]
          blocked_weekdays?: number[]
          employment_type?: string
          max_per_week?: number
          note?: string | null
          position?: string | null
          preferred_shifts?: string[]
          real_name?: string | null
          shop_id?: string | null
          updated_at?: string
          user_id?: string
          weekly_workdays?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_check_ins: {
        Row: {
          check_in_date: string
          checked_at: string
          exp_gained: number
          id: string
          streak: number
          user_id: string
        }
        Insert: {
          check_in_date: string
          checked_at?: string
          exp_gained?: number
          id?: string
          streak?: number
          user_id: string
        }
        Update: {
          check_in_date?: string
          checked_at?: string
          exp_gained?: number
          id?: string
          streak?: number
          user_id?: string
        }
        Relationships: []
      }
      user_experience: {
        Row: {
          current_streak: number
          last_check_in_date: string | null
          longest_streak: number
          total_check_ins: number
          total_exp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_check_in_date?: string | null
          longest_streak?: number
          total_check_ins?: number
          total_exp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_check_in_date?: string | null
          longest_streak?: number
          total_check_ins?: number
          total_exp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          id: string
          snapshot: Json
          source_id: string
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          snapshot?: Json
          source_id: string
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          snapshot?: Json
          source_id?: string
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          area_code: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          role_code: string | null
          suspended: boolean | null
          suspended_at: string | null
          user_id: string
        }
        Insert: {
          area_code?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_code?: string | null
          suspended?: boolean | null
          suspended_at?: string | null
          user_id: string
        }
        Update: {
          area_code?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_code?: string | null
          suspended?: boolean | null
          suspended_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      xianyu_price_snapshots: {
        Row: {
          avg_price: number | null
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          max_price: number | null
          min_price: number | null
          notes: string | null
          product_id: string | null
          query_key: string
          sample_count: number
          samples: Json
          suggested_price: number | null
          updated_at: string
        }
        Insert: {
          avg_price?: number | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          max_price?: number | null
          min_price?: number | null
          notes?: string | null
          product_id?: string | null
          query_key: string
          sample_count?: number
          samples?: Json
          suggested_price?: number | null
          updated_at?: string
        }
        Update: {
          avg_price?: number | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          max_price?: number | null
          min_price?: number | null
          notes?: string | null
          product_id?: string | null
          query_key?: string
          sample_count?: number
          samples?: Json
          suggested_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_experience: {
        Args: { _amount: number; _user_id: string }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_official_view: { Args: { _id: string }; Returns: undefined }
      perform_check_in: { Args: never; Returns: Json }
      user_has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "assistant" | "anchor"
      product_category:
        | "porcelain"
        | "incense"
        | "stationery"
        | "lacquerware"
        | "bronze"
        | "woodcraft"
        | "textile"
        | "jewelry"
        | "painting"
        | "other"
        | "jp_porcelain"
        | "eu_porcelain"
        | "antique_art"
        | "local_craft"
        | "anime_toy"
        | "otaku_goods"
        | "luxury"
        | "vintage_jewelry"
        | "game_console"
        | "walkman"
        | "ccd"
        | "media_record"
        | "playback_device"
        | "home_appliance"
        | "hobby"
      script_style: "professional" | "sales" | "cultural"
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
      app_role: ["admin", "operator", "assistant", "anchor"],
      product_category: [
        "porcelain",
        "incense",
        "stationery",
        "lacquerware",
        "bronze",
        "woodcraft",
        "textile",
        "jewelry",
        "painting",
        "other",
        "jp_porcelain",
        "eu_porcelain",
        "antique_art",
        "local_craft",
        "anime_toy",
        "otaku_goods",
        "luxury",
        "vintage_jewelry",
        "game_console",
        "walkman",
        "ccd",
        "media_record",
        "playback_device",
        "home_appliance",
        "hobby",
      ],
      script_style: ["professional", "sales", "cultural"],
    },
  },
} as const
