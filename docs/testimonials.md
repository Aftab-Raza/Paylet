# Testimonials

Apply `20261025000200_testimonials` to the production database using `prisma migrate deploy` before deploying the updated backend. Back up and test on a Neon branch first. Do not use migrate reset.

The landing page shows the 12 most recently created testimonials. There are no fabricated reviews. Authenticated users can publish one testimonial (10-600 characters), update it, and delete it. Publication requires explicit consent. Display names and testimonial text are public; emails, usernames, user IDs, avatars, and financial data are not returned by this endpoint.

Reviews publish immediately; an administrator moderation interface is not included. Users should not submit sensitive information. Backend rate limits constrain submissions, and all writes use the current session's user ID, not a client-supplied owner. The server's existing origin check applies to these routes. Text is rendered with React's normal escaping, not HTML.

Deleting a testimonial removes it from subsequent API responses. Copies already viewed or captured by others cannot be recalled. Editing a profile display name also changes the public author name.
