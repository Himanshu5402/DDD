import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";

const MotionBox = motion(Box);

export default function PageHeader({ title, subtitle, action }) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      sx={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        mb: 4,
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box>
        <Typography
          variant="h5"
          sx={{
            fontSize: { xs: 22, md: 28 },
            fontWeight: 800,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #4F46E5 0%, #0EA5E9 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.75,
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </MotionBox>
  );
}
