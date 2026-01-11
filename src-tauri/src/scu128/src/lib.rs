use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use rand::RngCore;
use once_cell::sync::Lazy;

static GLOBAL_COUNTER: Lazy<AtomicU64> = Lazy::new(|| {
    let mut seed = [0u8; 8];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    AtomicU64::new(u64::from_le_bytes(seed))
});

pub struct Scu128;

impl Scu128 {
    pub fn new() -> Self {
        Scu128
    }

    pub fn generate(&self) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis() as u64;

        let counter = GLOBAL_COUNTER.fetch_add(1, Ordering::SeqCst);
        
        let mut random_bytes = [0u8; 4];
        rand::rngs::OsRng.fill_bytes(&mut random_bytes);
        let random_val = u32::from_le_bytes(random_bytes);

        // 48 bits timestamp (enough for ~8900 years)
        // 48 bits counter
        // 32 bits random
        format!("{:012x}{:012x}{:08x}", timestamp & 0xFFFFFFFFFFFF, counter & 0xFFFFFFFFFFFF, random_val)
    }

    pub fn to_string(&self) -> String {
        self.generate()
    }
}

impl Default for Scu128 {
    fn default() -> Self {
        Self::new()
    }
}
