use rkyv::{AlignedVec, Deserialize, Serialize};
use rkyv::ser::serializers::AllocSerializer;
use rkyv::ser::serializers::BufferScratch;
use rkyv::validation::validators::DefaultValidator;
use bytecheck::CheckBytes;
use std::io;

/// Serialize a value using rkyv
pub fn serialize<T: Serialize<AllocSerializer<1024>>>(value: &T) -> io::Result<Vec<u8>> {
    let mut serializer = AllocSerializer::<1024>::default();
    serializer
        .serialize_value(value)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Serialization error: {}", e)))?;
    Ok(serializer.into_inner())
}

/// Deserialize a value using rkyv
pub fn deserialize<T: for<'a> Deserialize<T, DefaultValidator<'a>>>(bytes: &[u8]) -> io::Result<T> {
    let validator = DefaultValidator::new();
    rkyv::check_archived_root::<T>(bytes)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("Validation error: {}", e)))?;

    unsafe {
        rkyv::archived_root::<T>(bytes)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("Deserialization error: {}", e)))
            .map(|archived| archived.deserialize(&validator)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("Deserialization error: {}", e))))
    }?.map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("Deserialization error: {}", e)))
}

/// Serialize a value using rkyv with aligned buffer
pub fn serialize_aligned<T: Serialize<AllocSerializer<1024>>>(value: &T) -> io::Result<AlignedVec> {
    let mut serializer = AllocSerializer::<1024>::default();
    serializer
        .serialize_value(value)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Serialization error: {}", e)))?;
    Ok(serializer.into_inner().into())
}

/// Deserialize a value using rkyv from aligned buffer
pub fn deserialize_aligned<T: for<'a> Deserialize<T, DefaultValidator<'a>>>(bytes: &AlignedVec) -> io::Result<T> {
    deserialize(bytes)
}
