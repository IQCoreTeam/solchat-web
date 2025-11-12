use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_lang::solana_program::keccak::hashv;
use anchor_lang::solana_program::keccak::hash as keccak_hash;
use anchor_spl::token::TokenAccount;
use anchor_spl::token::accessor;
declare_id!("2KWmwbAk74kVZGwot6hVsino1y6dSSpJtUCYrLHRPsvi");
const DOMAIN_CONTENT: &[u8] = b"iqdb:roll:content";
const DOMAIN_TARGET:  &[u8] = b"iqdb:roll:target";
//Tools
pub const FEE_LAMPORTS: u64 = 3_000_000; // 0.003 SOL

pub const HARD_RECEIVER: Pubkey = pubkey!("EWNSTD8tikwqHMcRNuuNbZrnYJUiJdKq9UXLXSEU4wZ1");
fn require_gate_if_enabled(
    table: &Table,
    signer: &Pubkey,
    signer_ata_opt: &Option<AccountInfo>,
) -> Result<()> {
    if table.gate_mint == Pubkey::default() {
        return Ok(());
    }
    let ata_ai = signer_ata_opt.as_ref().ok_or(IqErr::Unauthorized)?;


    let owner = accessor::authority(ata_ai)?;
    let mint  = accessor::mint(ata_ai)?;
    let amt   = accessor::amount(ata_ai)?;

    require!(owner == *signer, IqErr::Unauthorized);
    require!(mint  == table.gate_mint, IqErr::Unauthorized);
    require!(amt   >= 1, IqErr::Unauthorized);
    Ok(())
}

fn state_update_with_rolling(txref: &mut TxRef, domain: &[u8], new_tx: &[u8]) -> Result<()> {
    require!(new_tx.len() <= 90, IqErr::TxTooLong);
    let next_seq = bump_seq(txref.seq)?;
    let next_roll = roll_minimal(&txref.rolling, domain, new_tx);
    txref.seq = next_seq;//change number
    txref.last_tx = new_tx.to_vec();
    txref.rolling = next_roll;
    Ok(())
}
// 1 < 2 < 3 < 4
// user: gimme 2 data and math
// this by the math

// PDA + "cat_food" + ca

/// user can exactly go over there
/// without bringing all of infomation of the database.
///
///
// made the rolling, for ensure we can find the state change history directly.
fn roll_minimal(prev: &[u8; 32], domain: &[u8], new_bytes: &[u8]) -> [u8; 32] {
    keccak_hash(&[domain, prev, new_bytes].concat()).0
}

fn bump_seq(prev: u64) -> core::result::Result<u64, IqErr> {
    prev.checked_add(1).ok_or(IqErr::Overflow)
}

fn ensure_root_push_capacity_for_table_and_global(root_ai: &AccountInfo, root: &Root, new_name: &[u8]) -> Result<()> {
    let new_len = new_name.len();
    let mut need = 8 + 32;
    need += size_of_vec_u8(&root.id);                 // NEW
    need += size_of_vecvec_u8(&root.table_seeds);
    need += size_of_vecvec_u8(&root.global_table_seeds);
    need += (4 + new_len) + (4 + new_len);
    let have = root_ai.data_len();
    if need > have { msg!("Root realloc required. have={}, need={}, missing={}", have, need, need - have); return Err(IqErr::NeedsRealloc.into()); }
    Ok(())
}

fn ensure_root_push_capacity_for_global(root_ai: &AccountInfo, root: &Root, new_name: &[u8]) -> Result<()> {
    let new_len = new_name.len();
    let mut need = 8 + 32;
    need += size_of_vec_u8(&root.id);                 // NEW
    need += size_of_vecvec_u8(&root.table_seeds);
    need += size_of_vecvec_u8(&root.global_table_seeds);
    need += 4 + new_len;
    let have = root_ai.data_len();
    if need > have { msg!("Root realloc required. have={}, need={}, missing={}", have, need, need - have); return Err(IqErr::NeedsRealloc.into()); }
    Ok(())
}

fn size_of_vecvec_u8(cols: &[Vec<u8>]) -> usize {
    let mut sz = 4;
    for c in cols {
        sz += 4 + c.len();
    }
    sz
}
fn size_of_vec_u8(v: &Vec<u8>) -> usize {
    4 + v.len()  // Vec<u8> 직렬화: 4바이트(len) + 데이터
}
fn size_of_table(table: &Table) -> usize {
    size_of_vec_u8(&table.name)
        + size_of_vecvec_u8(&table.column_names)
        + size_of_vec_u8(&table.id_col)
        + size_of_vecvec_u8(&table.ext_keys)
}
fn ensure_table_fits(table_ai: &AccountInfo, column_names: &Vec<Vec<u8>>, id_col: &Vec<u8>, ext_keys: &Vec<Vec<u8>>, table_name: &Vec<u8>) -> Result<()> {

    let have = table_ai.data_len();

    let need = 8
        + size_of_vec_u8(table_name)
        + size_of_vecvec_u8(column_names)
        + size_of_vec_u8(id_col)
        + size_of_vecvec_u8(ext_keys);

    if need > have {
        msg!("Table realloc required. have={}, need={}, missing={}", have, need, need - have);
        return Err(IqErr::NeedsRealloc.into());
    }
    Ok(())
}


fn ensure_root_tables_fit(
    root_ai: &AccountInfo,
    root: &Root,
    names: &[Vec<u8>],
    global_names: &[Vec<u8>],
) -> Result<()> {
    let have = root_ai.data_len();
    let need = 8                 // discriminator
        + 32                     // creator
        + size_of_vec_u8(&root.id)
        + size_of_vecvec_u8(names)
        + size_of_vecvec_u8(global_names);

    if need > have {
        msg!("Root realloc required. have={}, need={}, missing={}", have, need, need - have);
        return Err(IqErr::NeedsRealloc.into());
    }
    Ok(())
}

fn id_col_in_column_names(column_names: &Vec<Vec<u8>>, id_col: &Vec<u8>) -> bool {
    column_names.iter().any(|c| c == id_col)
}
#[program]
pub mod iq_database {
    use super::*;

    pub fn initialize_root(ctx: Context<InitializeRoot>, root_id: Vec<u8>) -> Result<()> {
        let root = &mut ctx.accounts.root;
        require!(root_id.len() <= 32, IqErr::InvalidRootId);
        root.creator = ctx.accounts.signer.key();
        root.table_seeds = Vec::<Vec<u8>>::new();
        root.global_table_seeds = Vec::<Vec<u8>>::new();
        root.id = root_id;
        Ok(())
    }


    pub fn create_table(
        ctx: Context<CreateTable>,
        _root_id: Vec<u8>,
        table_seed: Vec<u8>,
        table_name: Vec<u8>,
        column_names: Vec<Vec<u8>>,
        id_col: Vec<u8>,
        ext_keys: Vec<Vec<u8>>,
        gate_mint_opt: Option<Pubkey>,
    ) -> Result<()> {
        require!(!table_name.is_empty(), IqErr::EmptyName);
        require!(!column_names.is_empty(), IqErr::EmptyColumns);
        require!(!id_col.is_empty(), IqErr::EmptyIdCol);
        require!(id_col_in_column_names(&column_names, &id_col), IqErr::IdColNotInColumns);

        let table_ai = ctx.accounts.table.to_account_info();
        ensure_table_fits(&table_ai, &column_names, &id_col, &ext_keys, &table_name)?;

        let root_ai = ctx.accounts.root.to_account_info();
        let root_ref: &Root = &*ctx.accounts.root;
        ensure_root_push_capacity_for_table_and_global(&root_ai, root_ref, &table_seed)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to:   ctx.accounts.receiver.to_account_info(),
                }
            ),
            FEE_LAMPORTS,
        )?;


        let root = &mut ctx.accounts.root;
        root.table_seeds.push(table_seed.clone());

        //adding the things that pushing the table_name inside of the globaltable_names
        root.global_table_seeds.push(table_seed.clone());


        let table = &mut ctx.accounts.table;
        table.name = table_name;
        table.column_names = column_names;
        table.id_col = id_col;
        table.ext_keys = ext_keys;
        table.gate_mint = gate_mint_opt.unwrap_or(Pubkey::default()); // NEW

        ctx.accounts.instruction_table.bump = ctx.bumps.instruction_table;
        Ok(())
    }

    pub fn create_ext_table(
        ctx: Context<CreateExtTable>,
        root_id: Vec<u8>,
        table_seed: Vec<u8>,
        table_name: Vec<u8>,
        column_names: Vec<Vec<u8>>,
        id_col: Vec<u8>,
        ext_keys: Vec<Vec<u8>>,

        gate_mint_opt: Option<Pubkey>,
    ) -> Result<()> {
        require!(!table_name.is_empty(), IqErr::EmptyName);
        require!(!column_names.is_empty(), IqErr::EmptyColumns);
        require!(!id_col.is_empty(), IqErr::EmptyIdCol);
        require!(id_col_in_column_names(&column_names, &id_col), IqErr::IdColNotInColumns);

        let table_ai = ctx.accounts.table.to_account_info();
        ensure_table_fits(&table_ai, &column_names, &id_col, &ext_keys, &table_name)?;

        //adding the things that pushing the table_name inside of the globaltable_names
        let root_ai = ctx.accounts.root.to_account_info();
        let root_ref: &Root = &*ctx.accounts.root;
        ensure_root_push_capacity_for_global(&root_ai, root_ref, &table_seed)?;

        let root = &mut ctx.accounts.root;
        root.global_table_seeds.push(table_seed.clone());

        let table = &mut ctx.accounts.table;
        table.name = table_name;
        table.column_names = column_names;
        table.id_col = id_col;
        table.ext_keys = ext_keys;
        table.gate_mint = gate_mint_opt.unwrap_or(Pubkey::default());

        let inst_bump = ctx.bumps.instruction_table;
        ctx.accounts.instruction_table.bump = ctx.bumps.instruction_table;

        Ok(())
    }


    pub fn update_table(
        ctx: Context<UpdateTableByName>,
        root_id: Vec<u8>,
        table_seed: Vec<u8>,
        table_name: Vec<u8>,
        column_names: Vec<Vec<u8>>,
        id_col: Vec<u8>,
        ext_keys: Vec<Vec<u8>>,
    ) -> Result<()> {
        require!(!table_name.is_empty(), IqErr::EmptyName);
        require!(!column_names.is_empty(), IqErr::EmptyColumns);
        require!(!id_col.is_empty(), IqErr::EmptyIdCol);
        require_keys_eq!(ctx.accounts.root.creator, ctx.accounts.signer.key(), IqErr::Unauthorized);
        require!(id_col_in_column_names(&column_names, &id_col), IqErr::IdColNotInColumns);

        let table_ai = ctx.accounts.table.to_account_info();
        ensure_table_fits(&table_ai, &column_names, &id_col, &ext_keys, &table_name)?;

        let table = &mut ctx.accounts.table;
        table.name = table_name.clone();
        table.column_names = column_names;
        table.id_col = id_col;
        table.ext_keys = ext_keys;

        Ok(())
    }

    pub fn update_root_table_list(
        ctx: Context<UpdateRootTableList>,
        root_id: Vec<u8>,
        new_table_seeds: Vec<Vec<u8>>,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.root.creator, ctx.accounts.signer.key(), IqErr::Unauthorized);

        let root_ai = ctx.accounts.root.to_account_info();
        let root_ref: &Root = &*ctx.accounts.root;
        let existing_global = &ctx.accounts.root.global_table_seeds;
        ensure_root_tables_fit(&root_ai, root_ref, &new_table_seeds, existing_global)?;

        let root = &mut ctx.accounts.root;
        root.table_seeds = new_table_seeds;

        Ok(())
    }

    pub fn write_data(
        ctx: Context<UseTableByName>,
        _root_id: Vec<u8>,
        table_seed: Vec<u8>,
        _table_name: Vec<u8>,
        row_json_tx: Vec<u8>,
    ) -> Result<()> {
        require_gate_if_enabled(
            &ctx.accounts.table,
            &ctx.accounts.signer.key(),
            &ctx.accounts.signer_ata,
        )?;

        state_update_with_rolling(&mut ctx.accounts.tx_ref, DOMAIN_CONTENT, &row_json_tx)?;
        Ok(())
    }

    pub fn database_instruction(
        ctx: Context<UseInstructionTableByName>,
        _root_id: Vec<u8>,
        table_seed: Vec<u8>,
        _table_name: Vec<u8>,
        target_tx: Vec<u8>,
        content_json_tx: Vec<u8>,
    ) -> Result<()> {
        // instruction_table은 table의 자식이므로 table도 Accounts에 명시해 둔다
        require_gate_if_enabled(
            &ctx.accounts.table,
            &ctx.accounts.signer.key(),
            &ctx.accounts.signer_ata,
        )?;

        state_update_with_rolling(&mut ctx.accounts.tx_ref, DOMAIN_CONTENT, &content_json_tx)?;
        state_update_with_rolling(&mut ctx.accounts.target_tx_ref, DOMAIN_TARGET, &target_tx)?;
        Ok(())
    }


}

#[account]
pub struct Root {
    pub creator: Pubkey,
    pub table_seeds: Vec<Vec<u8>>,// [ cat_food, zozo, IQTeamcall ]
    pub global_table_seeds: Vec<Vec<u8>>, // this contain the all table names include ext table

    pub id: Vec<u8>, // database id
}

#[account]
pub struct Table {
    pub column_names: Vec<Vec<u8>>,
    pub id_col: Vec<u8>,
    pub ext_keys:  Vec<Vec<u8>>,
    pub name: Vec<u8>,

    pub gate_mint: Pubkey,
}

#[account]
pub struct InstructionTable {
    pub bump: u8,
}

#[account]
pub struct TxRef {
    pub seq: u64,                 // increase seq
    pub last_tx: Vec<u8>,         // recent transaction
    pub rolling: [u8; 32],        // rolling hash
}


#[derive(Accounts)]
#[instruction(root_id: Vec<u8>)]
pub struct InitializeRoot<'info> {
    #[account(
        init,
        payer = signer,
         space = 8 + 32 + (4 + 1000) + (4 + 1000) + (4 + 64),
        // database id = under 32byte
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,

    #[account(
      init, payer = signer,
      space = 8 + 8 + 4 + 90 + 32,
      seeds = [b"iqdb-txref", crate::ID.as_ref(), signer.key().as_ref()],
      bump
    )]
    pub tx_ref: Account<'info, TxRef>,

    #[account(
      init, payer = signer,
      space = 8 + 8 + 4 + 90 + 32,
      seeds = [b"iqdb-txref", crate::ID.as_ref(), signer.key().as_ref(), b"target"],
      bump
    )]
    pub target_tx_ref: Account<'info, TxRef>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(root_id: Vec<u8>, table_seed: Vec<u8>, table_name: Vec<u8>)]
pub struct CreateTable<'info> {
    #[account(
        mut,
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,
    #[account(mut, address = HARD_RECEIVER)]
    pub receiver: SystemAccount<'info>,

    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
    init,
    payer = signer,

    space = 8
        + (4 + 30)               // name: Vec<u8> (default capacity 30)
        + (4 + 50 * (4 + 32))    // column_names: 50 items, each 32
        + (4 + 64)               // id_col: 64byte
        + (4 + 16 * (4 + 32))
    +32
    ,   // ext_keys: assume 32byte, 16 items
    seeds = [
        b"iqdb-table",
        crate::ID.as_ref(),
        root.key().as_ref(),
        table_seed.as_ref(),
    ],
    bump
    )]
    pub table: Account<'info, Table>,

    #[account(
        init,
        payer = signer,
        space = 8 + 1,
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
            b"instruction",
        ],
        bump
    )]
    /// CHECK: no data stored
    pub instruction_table: Account<'info, InstructionTable>,

    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(root_id: Vec<u8>, table_seed: Vec<u8>, table_name: Vec<u8>)]
pub struct CreateExtTable<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,

    #[account(
        init,
        payer = signer,
        space = 8
            + (4 + 30)               // name: Vec<u8> (default capacity 30)
            + (4 + 50 * (4 + 32))    // column_names: 50 items, each 32
            + (4 + 64)               // id_col: 64byte
            + (4 + 16 * (4 + 32))
         +32
        ,   // ext_keys: assume 32byte, 16 items
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
        ],
        bump
    )]
    pub table: Account<'info, Table>,

    #[account(
        init,
        payer = signer,
        space = 8 + 1,
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
            b"instruction",
        ],
        bump
    )]
    pub instruction_table: Account<'info, InstructionTable>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(root_id: Vec<u8>, table_seed: Vec<u8>, table_name: Vec<u8>)]
pub struct UpdateTableByName<'info> {
    #[account(
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,
    #[account(
        mut,
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
        ],
        bump
    )]
    pub table: Account<'info, Table>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(root_id: Vec<u8>)]
pub struct UpdateRootTableList<'info> {
    #[account(
        mut,
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(root_id: Vec<u8>, table_seed: Vec<u8>, table_name: Vec<u8>)]
pub struct UseTableByName<'info> {
    #[account(
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,

    #[account(
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
        ],
        bump
    )]
    pub table: Account<'info, Table>,

    #[account(
        mut,
        seeds = [b"iqdb-txref", crate::ID.as_ref(), signer.key().as_ref()],
        bump
    )]
    pub tx_ref: Account<'info, TxRef>,
    pub signer_ata: Option<AccountInfo<'info>>,

    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(root_id: Vec<u8>, table_seed: Vec<u8>, table_name: Vec<u8>)]
pub struct UseInstructionTableByName<'info> {
    #[account(
        seeds = [b"iqdb-root", crate::ID.as_ref(), root_id.as_ref()],
        bump
    )]
    pub root: Account<'info, Root>,
    #[account(
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
        ],
        bump
    )]
    pub table: Account<'info, Table>,

    #[account(
        seeds = [
            b"iqdb-table",
            crate::ID.as_ref(),
            root.key().as_ref(),
            table_seed.as_ref(),
            b"instruction",
        ],
        bump
    )]
    pub instruction_table: Account<'info, InstructionTable>,


    #[account(
        mut,
        seeds = [b"iqdb-txref", crate::ID.as_ref(), signer.key().as_ref()],
        bump
    )]
    pub tx_ref: Account<'info, TxRef>,

    #[account(
        mut,
        seeds = [b"iqdb-txref", crate::ID.as_ref(), signer.key().as_ref(), b"target"],
        bump
    )]
    pub target_tx_ref: Account<'info, TxRef>,
    pub signer_ata: Option<AccountInfo<'info>>,
    pub signer: Signer<'info>,
}
// to put it easy, target tx looks like : { tx: txid, table: table_name }

#[error_code]
pub enum IqErr {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Name cannot be empty")]
    EmptyName,
    #[msg("At least one column is required")]
    EmptyColumns,
    #[msg("UTF-8 invalid")]
    InvalidUtf8,
    #[msg("Table already exists")]
    TableExists,
    #[msg("Reallocation needed; not performed")]
    NeedsRealloc,
    #[msg("Row schema mismatch")]
    SchemaMismatch,
    #[msg("Tx id too long")]
    TxTooLong,
    #[msg("Overflow")]
    Overflow,
    #[msg("ID column is required")]
    EmptyIdCol,
    #[msg("ID column must exist in column_names")]
    IdColNotInColumns,
    #[msg("Table name too long")]
    NameTooLong,
    #[msg("Root id must be <= 32 bytes")]
    InvalidRootId,
}
