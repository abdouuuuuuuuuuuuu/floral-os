-- Live cursors were removed from the app. Close the Realtime topic so old
-- installed copies can no longer publish or read teammates' cursors.
DROP POLICY IF EXISTS "Blossom teammates can view live cursors" ON realtime.messages;
DROP POLICY IF EXISTS "Blossom teammates can send live cursors" ON realtime.messages;
