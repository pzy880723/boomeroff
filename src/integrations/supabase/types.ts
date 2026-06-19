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
      activities: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          form_fields: Json
          id: string
          max_applications: number | null
          name: string
          poster_url: string | null
          requires_review: boolean
          share_token: string
          starts_at: string | null
          status: string
          updated_at: string
          voucher_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          form_fields?: Json
          id?: string
          max_applications?: number | null
          name: string
          poster_url?: string | null
          requires_review?: boolean
          share_token?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          voucher_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          form_fields?: Json
          id?: string
          max_applications?: number | null
          name?: string
          poster_url?: string | null
          requires_review?: boolean
          share_token?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_applications: {
        Row: {
          activity_id: string
          applicant_name: string
          applicant_phone: string
          created_at: string
          form_data: Json
          id: string
          publish_confirm_note: string | null
          publish_confirmed: boolean
          publish_confirmed_at: string | null
          publish_confirmed_by: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sms_error: string | null
          sms_sent_at: string | null
          status: string
          updated_at: string
          voucher_claim_id: string | null
        }
        Insert: {
          activity_id: string
          applicant_name: string
          applicant_phone: string
          created_at?: string
          form_data?: Json
          id?: string
          publish_confirm_note?: string | null
          publish_confirmed?: boolean
          publish_confirmed_at?: string | null
          publish_confirmed_by?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          voucher_claim_id?: string | null
        }
        Update: {
          activity_id?: string
          applicant_name?: string
          applicant_phone?: string
          created_at?: string
          form_data?: Json
          id?: string
          publish_confirm_note?: string | null
          publish_confirmed?: boolean
          publish_confirmed_at?: string | null
          publish_confirmed_by?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          voucher_claim_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_applications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_applications_voucher_claim_id_fkey"
            columns: ["voucher_claim_id"]
            isOneToOne: false
            referencedRelation: "voucher_claims"
            referencedColumns: ["id"]
          },
        ]
      }
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
      claim_otp: {
        Row: {
          attempts: number
          claim_id: string
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          claim_id: string
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          claim_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_otp_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "voucher_claims"
            referencedColumns: ["id"]
          },
        ]
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
          thumbnail_url: string | null
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
          thumbnail_url?: string | null
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
          thumbnail_url?: string | null
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
      exp_pending: {
        Row: {
          amount: number
          claimed_at: string | null
          created_at: string
          id: string
          source: string
          source_ref: string | null
          title: string
          user_id: string
        }
        Insert: {
          amount: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          source: string
          source_ref?: string | null
          title: string
          user_id: string
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          source?: string
          source_ref?: string | null
          title?: string
          user_id?: string
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
      marketing_assets: {
        Row: {
          created_at: string
          id: string
          input_image_urls: string[]
          kind: string
          meta: Json
          output_text: string | null
          output_url: string | null
          published_at: string | null
          published_platforms: string[]
          shop_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_image_urls?: string[]
          kind: string
          meta?: Json
          output_text?: string | null
          output_url?: string | null
          published_at?: string | null
          published_platforms?: string[]
          shop_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_image_urls?: string[]
          kind?: string
          meta?: Json
          output_text?: string | null
          output_url?: string | null
          published_at?: string | null
          published_platforms?: string[]
          shop_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_characters: {
        Row: {
          auto_anchor: boolean
          core_emotion: string | null
          cover_url: string
          created_at: string
          created_by: string
          id: string
          meta: Json
          name: string
          prompt: string | null
          ref_image_urls: Json
          role_label: string | null
          shop_id: string
          source: string
          updated_at: string
          visual_signature: string | null
        }
        Insert: {
          auto_anchor?: boolean
          core_emotion?: string | null
          cover_url: string
          created_at?: string
          created_by: string
          id?: string
          meta?: Json
          name: string
          prompt?: string | null
          ref_image_urls?: Json
          role_label?: string | null
          shop_id: string
          source?: string
          updated_at?: string
          visual_signature?: string | null
        }
        Update: {
          auto_anchor?: boolean
          core_emotion?: string | null
          cover_url?: string
          created_at?: string
          created_by?: string
          id?: string
          meta?: Json
          name?: string
          prompt?: string | null
          ref_image_urls?: Json
          role_label?: string | null
          shop_id?: string
          source?: string
          updated_at?: string
          visual_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_characters_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_presets: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      marketing_video_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          last_polled_at: string | null
          output_url: string | null
          parent_job_id: string | null
          provider: string | null
          provider_task_id: string | null
          script: Json
          segment_index: number | null
          segment_total: number | null
          segment_url: string | null
          shop_id: string | null
          status: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          last_polled_at?: string | null
          output_url?: string | null
          parent_job_id?: string | null
          provider?: string | null
          provider_task_id?: string | null
          script: Json
          segment_index?: number | null
          segment_total?: number | null
          segment_url?: string | null
          shop_id?: string | null
          status?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          last_polled_at?: string | null
          output_url?: string | null
          parent_job_id?: string | null
          provider?: string | null
          provider_task_id?: string | null
          script?: Json
          segment_index?: number | null
          segment_total?: number | null
          segment_url?: string | null
          shop_id?: string | null
          status?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_video_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "marketing_video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_video_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          title: string
          type: string
        }
        Insert: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          title: string
          type?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          title?: string
          type?: string
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
      shop_marketing_profiles: {
        Row: {
          brand_keywords: string[]
          cover_image_url: string | null
          created_at: string
          default_hashtags: string[]
          description: string | null
          selling_points: Json
          shop_id: string
          tagline: string | null
          target_audience: string | null
          tone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_keywords?: string[]
          cover_image_url?: string | null
          created_at?: string
          default_hashtags?: string[]
          description?: string | null
          selling_points?: Json
          shop_id: string
          tagline?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_keywords?: string[]
          cover_image_url?: string | null
          created_at?: string
          default_hashtags?: string[]
          description?: string | null
          selling_points?: Json
          shop_id?: string
          tagline?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_marketing_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
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
      sms_test_otp: {
        Row: {
          code: string
          consumed_at: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          phone: string
          tencent_response: Json | null
        }
        Insert: {
          code: string
          consumed_at?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          phone: string
          tencent_response?: Json | null
        }
        Update: {
          code?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          phone?: string
          tencent_response?: Json | null
        }
        Relationships: []
      }
      spirit_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          last_message_at: string
          message_count: number
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spirit_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          images: Json
          meta: Json
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          images?: Json
          meta?: Json
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          images?: Json
          meta?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spirit_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "spirit_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      spirit_usage: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_ms: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          status: string
          tool_calls: number
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          status?: string
          tool_calls?: number
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          status?: string
          tool_calls?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spirit_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "spirit_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      task_claims: {
        Row: {
          amount: number
          claim_date: string
          claimed_at: string
          task_key: string
          user_id: string
        }
        Insert: {
          amount: number
          claim_date: string
          claimed_at?: string
          task_key: string
          user_id: string
        }
        Update: {
          amount?: number
          claim_date?: string
          claimed_at?: string
          task_key?: string
          user_id?: string
        }
        Relationships: []
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
      voucher_claims: {
        Row: {
          activity_application_id: string | null
          claimed_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          recipient_extra: Json
          recipient_name: string | null
          recipient_phone: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          share_token: string
          short_code: string | null
          source: string
          status: string
          updated_at: string
          voucher_id: string
        }
        Insert: {
          activity_application_id?: string | null
          claimed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          recipient_extra?: Json
          recipient_name?: string | null
          recipient_phone?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          share_token?: string
          short_code?: string | null
          source?: string
          status?: string
          updated_at?: string
          voucher_id: string
        }
        Update: {
          activity_application_id?: string | null
          claimed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          recipient_extra?: Json
          recipient_name?: string | null
          recipient_phone?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          share_token?: string
          short_code?: string | null
          source?: string
          status?: string
          updated_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_claims_activity_application_id_fkey"
            columns: ["activity_application_id"]
            isOneToOne: false
            referencedRelation: "activity_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_claims_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          detail: Json | null
          id: string
          voucher_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          voucher_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_logs_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          face_value: number
          id: string
          name: string
          sort_order: number
          terms: string | null
          updated_at: string
          valid_days: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          face_value?: number
          id?: string
          name: string
          sort_order?: number
          terms?: string | null
          updated_at?: string
          valid_days?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          face_value?: number
          id?: string
          name?: string
          sort_order?: number
          terms?: string | null
          updated_at?: string
          valid_days?: number
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          active: boolean
          applicant_name: string | null
          applicant_phone: string | null
          applicant_screenshot_url: string | null
          applicant_submitted_at: string | null
          approved_at: string | null
          approved_by: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_amount: number
          ends_at: string | null
          expires_at: string | null
          id: string
          min_spend: number | null
          name: string | null
          note: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          reject_reason: string | null
          share_token: string | null
          shop_id: string | null
          starts_at: string | null
          status: string | null
          template_terms: string | null
          threshold_type: string
          type_id: string | null
          updated_at: string
          valid_days: number
        }
        Insert: {
          active?: boolean
          applicant_name?: string | null
          applicant_phone?: string | null
          applicant_screenshot_url?: string | null
          applicant_submitted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          ends_at?: string | null
          expires_at?: string | null
          id?: string
          min_spend?: number | null
          name?: string | null
          note?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          reject_reason?: string | null
          share_token?: string | null
          shop_id?: string | null
          starts_at?: string | null
          status?: string | null
          template_terms?: string | null
          threshold_type?: string
          type_id?: string | null
          updated_at?: string
          valid_days?: number
        }
        Update: {
          active?: boolean
          applicant_name?: string | null
          applicant_phone?: string | null
          applicant_screenshot_url?: string | null
          applicant_submitted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          ends_at?: string | null
          expires_at?: string | null
          id?: string
          min_spend?: number | null
          name?: string | null
          note?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          reject_reason?: string | null
          share_token?: string | null
          shop_id?: string | null
          starts_at?: string | null
          status?: string | null
          template_terms?: string | null
          threshold_type?: string
          type_id?: string | null
          updated_at?: string
          valid_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "voucher_types"
            referencedColumns: ["id"]
          },
        ]
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
      can_assign_role_code: {
        Args: { _actor: string; _target_role_code: string }
        Returns: boolean
      }
      claim_daily_task: { Args: { _task_key: string }; Returns: Json }
      claim_pending_exp: { Args: { _id: string }; Returns: Json }
      delete_voucher_safe: { Args: { _id: string }; Returns: Json }
      gen_short_code: { Args: never; Returns: string }
      gen_voucher_code: { Args: never; Returns: string }
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
