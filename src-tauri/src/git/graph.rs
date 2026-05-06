use crate::git::types::{CommitInfo, GraphCell, GraphCellType};
use std::collections::HashMap;

const MAX_COLORS: usize = 8;

pub fn compute_graph_columns(commits: &mut Vec<CommitInfo>) {
    // Maps commit hash → column index currently occupied
    let mut active_columns: Vec<Option<String>> = Vec::new();
    // Maps hash → column for commits we know are coming
    let mut hash_to_col: HashMap<String, usize> = HashMap::new();

    for commit in commits.iter_mut() {
        let hash = commit.hash.clone();
        let parents = commit.parent_hashes.clone();

        // Find or assign column for this commit
        let col = if let Some(&c) = hash_to_col.get(&hash) {
            c
        } else {
            // Find first free column
            let free = active_columns.iter().position(|s| s.is_none());
            let c = free.unwrap_or(active_columns.len());
            if c == active_columns.len() {
                active_columns.push(None);
            }
            c
        };

        let color_idx = col % MAX_COLORS;
        let mut cells: Vec<GraphCell> = Vec::new();

        // Mark commit node
        cells.push(GraphCell {
            col,
            cell_type: GraphCellType::Commit,
            color_idx,
        });

        // Pass-through for all other active columns
        for (i, slot) in active_columns.iter().enumerate() {
            if i != col && slot.is_some() {
                cells.push(GraphCell {
                    col: i,
                    cell_type: GraphCellType::PassThrough,
                    color_idx: i % MAX_COLORS,
                });
            }
        }

        commit.graph_columns = cells;

        // Update active columns: replace current commit's slot with first parent
        if let Some(first_parent) = parents.first() {
            active_columns[col] = Some(first_parent.clone());
            hash_to_col.insert(first_parent.clone(), col);
        } else {
            active_columns[col] = None;
        }

        // Additional parents get new columns
        for parent in parents.iter().skip(1) {
            if !hash_to_col.contains_key(parent) {
                let free = active_columns.iter().position(|s| s.is_none());
                let c = free.unwrap_or(active_columns.len());
                if c == active_columns.len() {
                    active_columns.push(None);
                }
                active_columns[c] = Some(parent.clone());
                hash_to_col.insert(parent.clone(), c);
            }
        }

        // Clean up hash_to_col for this commit
        hash_to_col.remove(&hash);
    }
}
