use git2::{Repository, Signature};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
}

#[derive(Serialize)]
pub struct DiffEntry {
    pub path: String,
    pub status: String,
}

fn project_dir(name: &str) -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("beehive-studio")
        .join("projects")
        .join(name)
}

fn ensure_project_dir(name: &str) -> Result<PathBuf, String> {
    let dir = project_dir(name);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create project dir: {}", e))?;
    Ok(dir)
}

fn default_signature(repo: &Repository) -> Result<Signature<'_>, String> {
    repo.signature().or_else(|_| {
        Signature::now("Beehive Studio", "studio@beehive.local")
            .map_err(|e| format!("Failed to create signature: {}", e))
    })
}

fn chrono_now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Initialize a new git repository for a project.
#[tauri::command]
pub async fn git_init_project(name: String) -> Result<String, String> {
    let dir = ensure_project_dir(&name)?;

    if dir.join(".git").exists() {
        return Ok("Repository already exists".to_string());
    }

    let repo = Repository::init(&dir).map_err(|e| format!("Failed to init repo: {}", e))?;

    // Create initial empty commit so HEAD exists
    let sig = default_signature(&repo)?;
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;

    // Write a placeholder file so the initial commit has content
    let placeholder_path = dir.join("project.json");
    let meta = serde_json::json!({
        "name": name,
        "version": "0.4.0",
        "created_at": chrono_now_secs(),
    });
    fs::write(
        &placeholder_path,
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Write error: {}", e))?;

    index
        .add_path(Path::new("project.json"))
        .map_err(|e| format!("Add error: {}", e))?;
    index.write().map_err(|e| format!("Write index: {}", e))?;

    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Tree write: {}", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Tree find: {}", e))?;

    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(format!("Repository initialized at {:?}", dir))
}

/// Save a snapshot (auto-commit) of the current project state.
#[tauri::command]
pub async fn git_save_snapshot(
    name: String,
    clip_data: String,
    message: String,
) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    // Write clips to file
    if !clip_data.is_empty() {
        let clips_path = dir.join("clips.json");
        fs::write(&clips_path, &clip_data).map_err(|e| format!("Failed to write clips: {}", e))?;
    }

    // Update project metadata
    let meta_path = dir.join("project.json");
    let existing: serde_json::Value = if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    let meta = serde_json::json!({
        "name": existing.get("name").unwrap_or(&serde_json::json!(name)),
        "version": "0.4.0",
        "updated_at": chrono_now_secs(),
        "created_at": existing.get("created_at").unwrap_or(&serde_json::json!(chrono_now_secs())),
    });
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write metadata: {}", e))?;

    // Stage all changes
    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to get index: {}", e))?;
    index
        .add_all(["."].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Failed to stage changes: {}", e))?;
    index
        .write()
        .map_err(|e| format!("Failed to write index: {}", e))?;

    // Check if there are actually changes to commit
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Failed to write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Failed to find tree: {}", e))?;

    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let parent = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to get parent: {}", e))?;

    // Check if tree is different from parent
    let parent_tree = parent.tree().map_err(|e| format!("Parent tree: {}", e))?;
    let diff = repo
        .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
        .map_err(|e| format!("Diff error: {}", e))?;

    if diff.deltas().count() == 0 {
        return Ok("No changes to commit".to_string());
    }

    let sig = default_signature(&repo)?;
    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
        .map_err(|e| format!("Failed to commit: {}", e))?;

    Ok(format!("{}", commit_id))
}

/// List all branches in the project.
#[tauri::command]
pub async fn git_list_branches(name: String) -> Result<Vec<BranchInfo>, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let current_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_default();

    let branches = repo
        .branches(None)
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    let mut result = Vec::new();
    for branch_result in branches {
        let (branch, _bt) = branch_result.map_err(|e| format!("Branch error: {}", e))?;
        let branch_name = branch.name().map_err(|e| format!("Name error: {}", e))?;
        let name = branch_name.unwrap_or("(unnamed)").to_string();
        result.push(BranchInfo {
            is_current: name == current_branch,
            name,
        });
    }

    Ok(result)
}

/// Create a new branch from the current HEAD.
#[tauri::command]
pub async fn git_create_branch(name: String, branch: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to get commit: {}", e))?;

    repo.branch(&branch, &commit, false)
        .map_err(|e| format!("Failed to create branch '{}': {}", branch, e))?;

    Ok(format!("Branch '{}' created", branch))
}

/// Checkout (switch to) a branch.
#[tauri::command]
pub async fn git_checkout_branch(name: String, branch: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let obj = repo
        .revparse_single(&branch)
        .map_err(|e| format!("Branch '{}' not found: {}", branch, e))?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Failed to checkout: {}", e))?;

    repo.set_head(&format!("refs/heads/{}", branch))
        .map_err(|e| format!("Failed to set HEAD: {}", e))?;

    Ok(format!("Switched to branch '{}'", branch))
}

/// Get recent commit log.
#[tauri::command]
pub async fn git_log(name: String, count: usize) -> Result<Vec<CommitInfo>, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Revwalk error: {}", e))?;
    revwalk
        .push(head.target().unwrap())
        .map_err(|e| format!("Push error: {}", e))?;

    let mut commits = Vec::new();
    for oid in revwalk.take(count) {
        let oid = oid.map_err(|e| format!("Oid error: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Commit find error: {}", e))?;

        commits.push(CommitInfo {
            hash: format!("{}", commit.id()),
            short_hash: format!("{}", commit.id())[..7].to_string(),
            message: commit.message().unwrap_or("(no message)").to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            timestamp: commit.time().seconds(),
        });
    }

    Ok(commits)
}

/// Get diff between two refs.
#[tauri::command]
pub async fn git_diff(
    name: String,
    ref1: Option<String>,
    ref2: Option<String>,
) -> Result<Vec<DiffEntry>, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let tree1: git2::Tree = match ref1 {
        Some(r) => repo
            .revparse_single(&r)
            .map_err(|e| format!("Ref1 not found: {}", e))?
            .peel_to_tree()
            .map_err(|e| format!("Failed to peel tree1: {}", e))?,
        None => {
            let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
            head.peel_to_tree()
                .map_err(|e| format!("Tree peel: {}", e))?
        }
    };

    let tree2: git2::Tree = match ref2 {
        Some(r) => repo
            .revparse_single(&r)
            .map_err(|e| format!("Ref2 not found: {}", e))?
            .peel_to_tree()
            .map_err(|e| format!("Failed to peel tree2: {}", e))?,
        None => repo
            .head()
            .map_err(|e| format!("HEAD error: {}", e))?
            .peel_to_tree()
            .map_err(|e| format!("Tree peel: {}", e))?,
    };

    let diff = repo
        .diff_tree_to_tree(Some(&tree1), Some(&tree2), None)
        .map_err(|e| format!("Diff error: {}", e))?;

    let mut entries = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = format!("{:?}", delta.status());
        entries.push(DiffEntry { path, status });
    }

    Ok(entries)
}

/// Revert to a specific commit by checking out its tree.
#[tauri::command]
pub async fn git_revert(name: String, commit_hash: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;

    let obj = repo
        .revparse_single(&commit_hash)
        .map_err(|e| format!("Commit not found: {}", e))?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Checkout failed: {}", e))?;

    Ok(format!(
        "Reverted to {}",
        &commit_hash[..7.min(commit_hash.len())]
    ))
}

/// Export project as a .beehive.tar.gz archive.
#[tauri::command]
pub async fn git_export_tarball(name: String, output_path: String) -> Result<String, String> {
    let dir = project_dir(&name);
    if !dir.exists() {
        return Err(format!("Project '{}' not found", name));
    }

    let file =
        fs::File::create(&output_path).map_err(|e| format!("Failed to create tarball: {}", e))?;
    let enc = flate2::GzBuilder::new().write(file, flate2::Compression::default());
    let mut tar = tar::Builder::new(enc);

    tar.append_dir_all(".", &dir)
        .map_err(|e| format!("Failed to append dir: {}", e))?;
    tar.finish()
        .map_err(|e| format!("Failed to finish tarball: {}", e))?;

    Ok(output_path)
}

/// Import a project from a .beehive.tar.gz archive.
#[tauri::command]
pub async fn git_import_tarball(
    tarball_path: String,
    project_name: String,
) -> Result<String, String> {
    let dir = ensure_project_dir(&project_name)?;

    let file =
        fs::File::open(&tarball_path).map_err(|e| format!("Failed to open tarball: {}", e))?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);

    archive
        .unpack(&dir)
        .map_err(|e| format!("Failed to unpack: {}", e))?;

    Ok(format!("Project '{}' imported", project_name))
}

/// Get the current branch name.
#[tauri::command]
pub async fn git_current_branch(name: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Failed to open repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    head.shorthand()
        .map(|s| s.to_string())
        .ok_or_else(|| "No current branch".to_string())
}
