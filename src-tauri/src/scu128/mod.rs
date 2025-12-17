pub mod scu128 {
    use once_cell::sync::Lazy;
    use rand::{thread_rng, RngCore};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static GLOBAL_COUNTER: Lazy<AtomicU64> = Lazy::new(|| {
        let mut rng = thread_rng();
        AtomicU64::new(rng.next_u64())
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

            // High 64 bits: timestamp (ms)
            // Low 64 bits: monotonically increasing global counter starting at a random offset
            format!("{:016x}{:016x}", timestamp, counter)
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
}
