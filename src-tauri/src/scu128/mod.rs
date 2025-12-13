pub mod scu128 {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub struct Scu128 {
        counter: AtomicU64,
    }

    impl Scu128 {
        pub fn new() -> Self {
            Scu128 {
                counter: AtomicU64::new(0),
            }
        }

        pub fn generate(&self) -> String {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("Time went backwards")
                .as_millis();

            let counter = self.counter.fetch_add(1, Ordering::SeqCst);

            // Combine timestamp and counter into a 128-bit ID
            let high_bits = timestamp;
            let low_bits = counter;

            // Format as a 32-character hex string
            format!("{:016x}{:016x}", high_bits, low_bits)
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
