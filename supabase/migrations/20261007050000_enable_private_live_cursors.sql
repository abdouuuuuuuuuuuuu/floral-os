-- Private Realtime cursor channel for signed-in Blossom teammates.
DROP POLICY IF EXISTS "Blossom teammates can view live cursors" ON realtime.messages;
CREATE POLICY "Blossom teammates can view live cursors"
ON realtime.messages
FOR SELECT TO authenticated
USING (realtime.topic() = 'blossom-live-cursors');

DROP POLICY IF EXISTS "Blossom teammates can send live cursors" ON realtime.messages;
CREATE POLICY "Blossom teammates can send live cursors"
ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (realtime.topic() = 'blossom-live-cursors');
