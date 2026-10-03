# To do

- [ ] **Deploy the phone layout fixes** (commit `10e4fd0`). In cPanel → Git Version Control →
      Manage → Pull or Deploy, click **Update from Remote**, then **Deploy HEAD Commit**. Until
      then, small phones have to scroll to see the result after a guess.
- [ ] **Check the rate limit sees each player separately.** In phpMyAdmin, open the
      `submissions` table and check that the `ip_hash` values differ between players. If they're
      all identical, every player shares one limit of 30 scores an hour and the API needs
      adjusting. The table only keeps about a day of rows, so check soon after people have played.
