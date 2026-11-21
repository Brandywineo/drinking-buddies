CREATE UNIQUE INDEX email_outbox_host_membership_reminder_uq
  ON email_outbox ((payload->>'subscriptionId'))
  WHERE template_key = 'host_membership_renewal';
