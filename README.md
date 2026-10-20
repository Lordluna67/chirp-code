# Chirp: local HTML launcher + GitHub-hosted code

This setup keeps `Chirp_Launcher.html` as the local file you open. The launcher loads `chirp.css` and `chirp.js` from a **public GitHub repository**. Firebase remains responsible for authentication and live database data.

## 1. Create a public repository

1. Sign in to GitHub and create a new repository (for example, `chirp-code`).
2. Set visibility to **Public** so the browser can load the source files without signing in.
3. Do not upload private data, passwords, service-account keys, or anything that should not be public.

## 2. Upload these repository files

Upload these items from this folder to the **root** of the repository:

- `chirp.js`
- `chirp.css`
- the `assets` folder (currently contains a README placeholder)

You normally keep `Chirp_Launcher.html` on your own computer; you do not need to upload it.

On GitHub, use **Add file → Upload files**, select the files, and commit them to the `main` branch. Make sure `chirp.js` and `chirp.css` are at the repository root, not inside an extra nested folder.

## 3. Connect the local launcher to your repository

Open `Chirp_Launcher.html` in a text editor. Replace both placeholders in its URLs:

- `YOUR_GITHUB_USERNAME` → your GitHub username
- `YOUR_REPOSITORY` → the exact repository name

There are three URL places to update: `chirp.css`, `chirp.js`, and the `assets/` base URL. Save the launcher.

For example, if the username were `example-user` and the repository were `chirp-code`, a file URL would look like:

`https://raw.githubusercontent.com/example-user/chirp-code/main/chirp.js`

Do not copy that example literally unless those are actually your username and repository.

## 4. Test it

1. Open the `chirp.js` and `chirp.css` URLs in a browser. They should show source text, not a GitHub sign-in page or 404.
2. Double-click your edited `Chirp_Launcher.html` to open it locally.
3. Sign in and test chat, profiles, Elite effects, reports, and moderation.

If it looks unstyled or doesn't start, check the browser console for 404/network errors and confirm the URLs use the correct capitalization and `main` branch name. Try a hard refresh (`Ctrl` + `Shift` + `R`) if the browser cached an older file.

## 5. How future updates work

Edit `chirp.js` or `chirp.css` on GitHub and commit the changes. The local launcher will load the remote files on its next opening/refresh; browser/CDN caching may delay seeing a change. The launcher itself only needs changes if you change repository paths or add a new separately loaded file.

## Notes

- This uses classic external JavaScript, not `type="module"`, because local `file://` pages can hit CORS restrictions with JavaScript modules.
- The current `chirp.js` is extracted from the provided latest app file. Review and test all features before using it as the only copy. Keep the original HTML backup.
- This moves the code and static assets; it does not replace Firebase or reduce Firebase database usage. Keep Firebase rules secure because client-side source is public.
