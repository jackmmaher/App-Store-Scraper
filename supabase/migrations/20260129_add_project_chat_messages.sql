-- Migration: Add project chat messages table
-- Run this in Supabase SQL Editor to enable the chat feature

CREATE TABLE project_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES app_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching messages by project
CREATE INDEX idx_chat_messages_project ON project_chat_messages(project_id);

-- Index for ordering messages by creation time
CREATE INDEX idx_chat_messages_created ON project_chat_messages(created_at ASC);

-- Enable Row Level Security (optional, depends on your setup)
-- ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;
