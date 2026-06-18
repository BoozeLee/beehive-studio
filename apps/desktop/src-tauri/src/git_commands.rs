use git2::{Repository, Signature};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
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

pub(crate) fn project_dir(name: &str) -> PathBuf {
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
            parents: commit.parent_ids().map(|id| format!("{}", id)).collect(),
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

/// Fork session: save snapshot, create branch, checkout — atomic.
#[tauri::command]
pub async fn git_fork_session(
    name: String,
    branch_name: String,
    clip_data: String,
    message: String,
) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    // Write clips to file
    if !clip_data.is_empty() {
        let clips_path = dir.join("clips.json");
        fs::write(&clips_path, &clip_data).map_err(|e| format!("Write clips: {}", e))?;
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
    .map_err(|e| format!("Write meta: {}", e))?;

    // Stage all
    let mut index = repo.index().map_err(|e| format!("Index: {}", e))?;
    index
        .add_all(["."].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Add: {}", e))?;
    index.write().map_err(|e| format!("Write index: {}", e))?;

    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Tree write: {}", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Tree: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let parent = head
        .peel_to_commit()
        .map_err(|e| format!("Parent: {}", e))?;

    let parent_tree = parent.tree().map_err(|e| format!("Parent tree: {}", e))?;
    let diff = repo
        .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
        .map_err(|e| format!("Diff: {}", e))?;

    let sig = default_signature(&repo)?;
    let commit_id = if diff.deltas().count() > 0 {
        repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
            .map_err(|e| format!("Commit: {}", e))?
    } else {
        head.target().ok_or("No HEAD target")?
    };

    // Create branch from this commit
    let commit = repo
        .find_commit(commit_id)
        .map_err(|e| format!("Find commit: {}", e))?;
    repo.branch(&branch_name, &commit, false)
        .map_err(|e| format!("Create branch: {}", e))?;

    // Checkout new branch
    let obj = repo
        .revparse_single(&branch_name)
        .map_err(|e| format!("Revparse: {}", e))?;
    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Checkout: {}", e))?;
    repo.set_head(&format!("refs/heads/{}", branch_name))
        .map_err(|e| format!("Set HEAD: {}", e))?;

    Ok(format!("Forked to '{}' at {}", branch_name, commit_id))
}

/// Fork a new branch from a specific historical commit.
#[tauri::command]
pub async fn git_fork_from_commit(
    name: String,
    branch_name: String,
    commit_hash: String,
) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let commit = repo
        .revparse_single(&commit_hash)
        .map_err(|e| format!("Commit '{}' not found: {}", commit_hash, e))?
        .peel_to_commit()
        .map_err(|e| format!("Peel to commit: {}", e))?;

    repo.branch(&branch_name, &commit, false)
        .map_err(|e| format!("Create branch: {}", e))?;

    // Checkout
    let obj = repo
        .revparse_single(&branch_name)
        .map_err(|e| format!("Revparse: {}", e))?;
    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Checkout: {}", e))?;
    repo.set_head(&format!("refs/heads/{}", branch_name))
        .map_err(|e| format!("Set HEAD: {}", e))?;

    Ok(format!(
        "Forked '{}' from commit {}",
        branch_name,
        &commit_hash[..7.min(commit_hash.len())]
    ))
}

/// Read clips.json content from the current project directory.
#[tauri::command]
pub async fn git_read_clips(name: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let clips_path = dir.join("clips.json");
    if !clips_path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&clips_path).map_err(|e| format!("Read clips: {}", e))
}

/// Read clips.json from a specific git ref (branch, tag, commit).
#[tauri::command]
pub async fn git_read_clips_at(name: String, ref_name: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let obj = repo
        .revparse_single(&ref_name)
        .map_err(|e| format!("Ref '{}' not found: {}", ref_name, e))?;
    let tree = obj
        .peel_to_tree()
        .map_err(|e| format!("Peel to tree: {}", e))?;
    let entry = tree
        .get_path(Path::new("clips.json"))
        .map_err(|_| format!("No clips.json in '{}'", ref_name))?;
    let blob = entry
        .to_object(&repo)
        .map_err(|e| format!("To object: {}", e))?
        .peel_to_blob()
        .map_err(|e| format!("To blob: {}", e))?;
    let content = std::str::from_utf8(blob.content()).map_err(|e| format!("UTF8: {}", e))?;

    Ok(content.to_string())
}

/// Merge another branch's clips into the current branch.
#[tauri::command]
pub async fn git_merge_branch(name: String, source_branch: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    // Get source tree
    let source_obj = repo
        .revparse_single(&source_branch)
        .map_err(|e| format!("Source branch '{}' not found: {}", source_branch, e))?;
    let source_tree = source_obj
        .peel_to_tree()
        .map_err(|e| format!("Peel source tree: {}", e))?;

    // Get current branch tree
    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let current_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Current commit: {}", e))?;
    let current_tree = current_commit
        .tree()
        .map_err(|e| format!("Current tree: {}", e))?;

    // Extract clips.json content from both trees
    fn read_clips_from_tree(
        repo: &Repository,
        tree: &git2::Tree,
    ) -> Result<Vec<serde_json::Value>, String> {
        let entry = tree.get_path(Path::new("clips.json")).ok();
        match entry {
            Some(e) => {
                let obj = e.to_object(repo).map_err(|e| format!("To object: {}", e))?;
                let blob = obj.peel_to_blob().map_err(|e| format!("To blob: {}", e))?;
                let content =
                    std::str::from_utf8(blob.content()).map_err(|e| format!("UTF8: {}", e))?;
                serde_json::from_str(content).map_err(|e| format!("JSON parse: {}", e))
            }
            None => Ok(Vec::new()),
        }
    }

    let current_clips: Vec<serde_json::Value> = read_clips_from_tree(&repo, &current_tree)?;
    let source_clips: Vec<serde_json::Value> = read_clips_from_tree(&repo, &source_tree)?;

    // Merge: union by id, source wins on conflict, report conflicts
    let mut merged: HashMap<String, serde_json::Value> = HashMap::new();
    let mut conflicts: Vec<String> = Vec::new();

    for clip in &current_clips {
        if let Some(id) = clip.get("id").and_then(|v| v.as_str()) {
            merged.insert(id.to_string(), clip.clone());
        }
    }
    for clip in &source_clips {
        if let Some(id) = clip.get("id").and_then(|v| v.as_str()) {
            if merged.contains_key(id) {
                let current_name = merged[id]
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let source_name = clip.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if current_name != source_name {
                    conflicts.push(format!("Clip '{}' modified in both branches", id));
                }
            }
            merged.insert(id.to_string(), clip.clone());
        }
    }

    // Write merged clips.json
    let merged_array: Vec<serde_json::Value> = merged.into_values().collect();
    let merged_json =
        serde_json::to_string_pretty(&merged_array).map_err(|e| format!("Serialize: {}", e))?;
    let clips_path = dir.join("clips.json");
    fs::write(&clips_path, &merged_json).map_err(|e| format!("Write merged clips: {}", e))?;

    // Stage and commit
    let mut index = repo.index().map_err(|e| format!("Index: {}", e))?;
    index
        .add_all(["."].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Add: {}", e))?;
    index.write().map_err(|e| format!("Write index: {}", e))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Tree write: {}", e))?;
    let new_tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Tree: {}", e))?;

    let sig = default_signature(&repo)?;
    let merge_msg = format!("Merge branch '{}'", source_branch);
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &merge_msg,
        &new_tree,
        &[&current_commit],
    )
    .map_err(|e| format!("Commit: {}", e))?;

    let conflict_msg = if conflicts.is_empty() {
        String::new()
    } else {
        format!(" ({} conflicts resolved)", conflicts.len())
    };

    Ok(format!(
        "Merged '{}' into current{}",
        source_branch, conflict_msg
    ))
}

/// Delete a branch.
#[tauri::command]
pub async fn git_delete_branch(name: String, branch: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let mut found = repo
        .find_branch(&branch, git2::BranchType::Local)
        .map_err(|e| format!("Branch '{}' not found: {}", branch, e))?;
    found
        .delete()
        .map_err(|e| format!("Delete failed: {}", e))?;

    Ok(format!("Branch '{}' deleted", branch))
}

/// Rename a branch.
#[tauri::command]
pub async fn git_rename_branch(
    name: String,
    old_name: String,
    new_name: String,
) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let mut found = repo
        .find_branch(&old_name, git2::BranchType::Local)
        .map_err(|e| format!("Branch '{}' not found: {}", old_name, e))?;
    found
        .rename(&new_name, false)
        .map_err(|e| format!("Rename failed: {}", e))?;

    Ok(format!("Branch '{}' → '{}'", old_name, new_name))
}

/// Get or set per-branch metadata notes.
#[tauri::command]
pub async fn git_branch_notes(name: String, notes_json: Option<String>) -> Result<String, String> {
    let dir = project_dir(&name);
    let meta_path = dir.join(".branch-meta.json");

    let mut notes: HashMap<String, serde_json::Value> = if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    };

    if let Some(json) = notes_json {
        let update: HashMap<String, serde_json::Value> =
            serde_json::from_str(&json).map_err(|e| format!("Parse notes: {}", e))?;
        notes.extend(update);
        let out = serde_json::to_string_pretty(&notes).map_err(|e| format!("Serialize: {}", e))?;
        fs::write(&meta_path, &out).map_err(|e| format!("Write meta: {}", e))?;
    }

    serde_json::to_string_pretty(&notes).map_err(|e| format!("Serialize: {}", e))
}

/// Get commit log for any branch (not just HEAD).
#[tauri::command]
pub async fn git_log_for_branch(
    name: String,
    branch: String,
    count: usize,
) -> Result<Vec<CommitInfo>, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let branch_ref = repo
        .find_branch(&branch, git2::BranchType::Local)
        .map_err(|e| format!("Branch '{}' not found: {}", branch, e))?;
    let branch_commit = branch_ref
        .get()
        .peel_to_commit()
        .map_err(|e| format!("Peel to commit: {}", e))?;

    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk
        .push(branch_commit.id())
        .map_err(|e| format!("Push: {}", e))?;

    let mut commits = Vec::new();
    for oid in revwalk.take(count) {
        let oid = oid.map_err(|e| format!("Oid: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Find commit: {}", e))?;
        commits.push(CommitInfo {
            hash: format!("{}", commit.id()),
            short_hash: format!("{}", commit.id())[..7].to_string(),
            message: commit.message().unwrap_or("(no message)").to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            timestamp: commit.time().seconds(),
            parents: commit.parent_ids().map(|id| format!("{}", id)).collect(),
        });
    }

    Ok(commits)
}

/// Phase B: Hash an object for content addressing.
#[tauri::command]
pub async fn git_hash_object(data: String) -> Result<String, String> {
    let oid = git2::Oid::hash_object(git2::ObjectType::Blob, data.as_bytes())
        .map_err(|e| format!("Hash error: {}", e))?;
    Ok(format!("{}", oid))
}

/// Phase B: Create a tag on a commit.
#[tauri::command]
pub async fn git_tag(name: String, tag_name: String, message: String) -> Result<String, String> {
    let dir = project_dir(&name);
    let repo = Repository::open(&dir).map_err(|e| format!("Open repo: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let commit = head.peel_to_commit().map_err(|e| format!("Peel commit: {}", e))?;
    let sig = default_signature(&repo)?;

    let oid = repo.tag(&tag_name, &commit.into_object(), &sig, &message, false)
        .map_err(|e| format!("Tag error: {}", e))?;

    Ok(format!("{}", oid))
}
