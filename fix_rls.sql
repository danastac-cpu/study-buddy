CREATE POLICY "Users can enroll themselves" ON public.group_enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
